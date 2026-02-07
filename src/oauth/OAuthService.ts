import type { MikroAuth } from 'mikroauth';

import type {
  OAuthProviderConfig,
  OAuthUserInfo,
  OAuthTokens
} from './interfaces';

/**
 * @description Generic OAuth provider service that works with any OAuth 2.0 compliant provider.
 * Handles authorization flow, token exchange, and user info fetching.
 * Integrates with MikroAuth's createToken() method to issue MikroChat tokens.
 */
export class OAuthProvider {
  constructor(
    private readonly config: OAuthProviderConfig,
    private readonly mikroAuth: MikroAuth
  ) {}

  /**
   * @description Generate OAuth authorization URL for the provider.
   */
  getAuthorizationUrl(state: string): string {
    const scopes = Array.isArray(this.config.scopes)
      ? this.config.scopes.join(' ')
      : this.config.scopes;

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: scopes,
      state,
      ...this.config.authorizationParams
    });

    return `${this.config.authorizationUrl}?${params}`;
  }

  /**
   * @description Exchange authorization code for OAuth tokens.
   */
  async exchangeCodeForTokens(code: string): Promise<OAuthTokens> {
    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: this.config.redirectUri
    });

    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        ...this.config.tokenHeaders
      },
      body: body.toString()
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Token exchange failed: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    return response.json();
  }

  /**
   * @description Fetch user information from OAuth provider.
   */
  async fetchUserInfo(accessToken: string): Promise<any> {
    const response = await fetch(this.config.userInfoUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        ...this.config.userInfoHeaders
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `User info fetch failed: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    return response.json();
  }

  /**
   * @description Map provider-specific user info to standard format.
   */
  mapUserInfo(providerUserInfo: any): OAuthUserInfo {
    if (this.config.userMapping) {
      return this.config.userMapping(providerUserInfo);
    }

    return {
      id: providerUserInfo.sub || providerUserInfo.id?.toString(),
      email: providerUserInfo.email,
      name: providerUserInfo.name || providerUserInfo.preferred_username,
      username:
        providerUserInfo.preferred_username ||
        providerUserInfo.username ||
        providerUserInfo.email?.split('@')[0]
    };
  }

  /**
   * @description Complete OAuth flow and issue MikroChat tokens.
   */
  async handleCallback(
    code: string,
    ip?: string
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    tokenType: string;
    user: OAuthUserInfo;
  }> {
    const oauthTokens = await this.exchangeCodeForTokens(code);
    const providerUserInfo = await this.fetchUserInfo(oauthTokens.access_token);
    const user = this.mapUserInfo(providerUserInfo);

    if (!user.email) {
      throw new Error('OAuth provider did not return user email');
    }

    const tokens = await this.mikroAuth.createToken({
      email: user.email,
      username: user.username || user.name,
      role: 'user',
      ip
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.exp,
      tokenType: tokens.tokenType,
      user
    };
  }

  /**
   * @description Get provider configuration (safe subset for client display).
   */
  getPublicInfo(): { id: string; name: string; loginUrl: string } {
    return {
      id: this.config.id,
      name: this.config.name,
      loginUrl: `/auth/oauth/${this.config.id}`
    };
  }
}
