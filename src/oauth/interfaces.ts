/**
 * @description OAuth provider configuration for any OAuth 2.0 compliant provider.
 * Supports both common providers (Google, GitHub) and self-hosted solutions (Keycloak, Authentik).
 */
export interface OAuthProviderConfig {
  /** Unique identifier for this provider (e.g., 'google', 'github', 'keycloak') */
  id: string;
  /** Display name for the provider */
  name: string;
  /** OAuth 2.0 authorization endpoint */
  authorizationUrl: string;
  /** OAuth 2.0 token exchange endpoint */
  tokenUrl: string;
  /** User info endpoint (OpenID Connect userinfo or provider-specific) */
  userInfoUrl: string;
  /** OAuth client ID */
  clientId: string;
  /** OAuth client secret */
  clientSecret: string;
  /** Redirect URI (callback URL) */
  redirectUri: string;
  /** OAuth scopes to request (space-separated or array) */
  scopes: string | string[];
  /** Custom user mapping function to extract email/username from provider response */
  userMapping?: (userInfo: any) => OAuthUserInfo;
  /** Additional parameters to include in authorization request */
  authorizationParams?: Record<string, string>;
  /** Custom headers for token exchange */
  tokenHeaders?: Record<string, string>;
  /** Custom headers for user info request */
  userInfoHeaders?: Record<string, string>;
}

/**
 * @description Simplified configuration for common OAuth providers.
 * Just provide credentials, we handle the OAuth URLs.
 */
export interface OAuthPresetCredentials {
  /** OAuth client ID from the provider */
  clientId: string;
  /** OAuth client secret from the provider */
  clientSecret: string;
  /** Redirect URI (callback URL) for this provider */
  redirectUri: string;
  /** Override default scopes */
  scopes?: string | string[];
  /** Additional authorization parameters */
  authorizationParams?: Record<string, string>;
}

/**
 * @description OAuth configuration supporting both presets and custom providers.
 */
export interface OAuthConfiguration {
  /** Simplified configuration for common providers */
  presets?: {
    google?: OAuthPresetCredentials;
    github?: OAuthPresetCredentials;
    microsoft?: OAuthPresetCredentials;
    gitlab?: OAuthPresetCredentials;
  };
  /** Full custom provider configurations */
  custom?: OAuthProviderConfig[];
  /**
   * State token expiry in seconds (for CSRF protection).
   * @default 600
   */
  stateExpirySeconds?: number;
  /** Rate limiting configuration for OAuth endpoints */
  rateLimiting?: {
    /**
     * Maximum requests per window.
     * @default 10
     */
    maxAttempts?: number;
    /**
     * Time window in milliseconds.
     * @default 900000
     */
    windowMs?: number;
  };
}

/**
 * @description Standardized user information from OAuth providers.
 */
export interface OAuthUserInfo {
  /** Provider's unique user ID */
  id: string;
  /** User's email address */
  email: string;
  /** User's display name */
  name?: string;
  /** User's username */
  username?: string;
}

/**
 * @description OAuth tokens returned by provider.
 */
export interface OAuthTokens {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
}

/**
 * @description OAuth state for CSRF protection.
 */
export interface OAuthState {
  /** When this state expires (timestamp) */
  expires: number;
  /** Provider ID this state is for */
  providerId: string;
  /** IP address of the request */
  ip: string;
}

/**
 * @description Rate limit tracking information.
 */
export interface RateLimitRecord {
  /** Number of requests in current window */
  count: number;
  /** When the rate limit window resets (timestamp) */
  resetAt: number;
}
