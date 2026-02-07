import type { OAuthProviderConfig, OAuthUserInfo } from './interfaces';

/**
 * @description Preset configurations for common OAuth providers.
 * Users only need to provide clientId, clientSecret, and redirectUri.
 */
export const OAUTH_PRESETS: Record<
  string,
  Omit<OAuthProviderConfig, 'clientId' | 'clientSecret' | 'redirectUri'>
> = {
  google: {
    id: 'google',
    name: 'Google',
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
    scopes: 'openid email profile',
    authorizationParams: {
      access_type: 'offline',
      prompt: 'consent'
    },
    userMapping: (userInfo: any): OAuthUserInfo => ({
      id: userInfo.sub,
      email: userInfo.email,
      name: userInfo.name,
      username: userInfo.email.split('@')[0]
    })
  },

  github: {
    id: 'github',
    name: 'GitHub',
    authorizationUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userInfoUrl: 'https://api.github.com/user',
    scopes: 'user:email read:user',
    tokenHeaders: {
      Accept: 'application/json'
    },
    userInfoHeaders: {
      Accept: 'application/vnd.github.v3+json'
    },
    userMapping: (userInfo: any): OAuthUserInfo => ({
      id: userInfo.id.toString(),
      email: userInfo.email,
      name: userInfo.name || userInfo.login,
      username: userInfo.login
    })
  },

  microsoft: {
    id: 'microsoft',
    name: 'Microsoft',
    authorizationUrl:
      'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    userInfoUrl: 'https://graph.microsoft.com/v1.0/me',
    scopes: 'openid email profile User.Read',
    userMapping: (userInfo: any): OAuthUserInfo => ({
      id: userInfo.id,
      email: userInfo.mail || userInfo.userPrincipalName,
      name: userInfo.displayName,
      username: userInfo.userPrincipalName?.split('@')[0]
    })
  },

  gitlab: {
    id: 'gitlab',
    name: 'GitLab',
    authorizationUrl: 'https://gitlab.com/oauth/authorize',
    tokenUrl: 'https://gitlab.com/oauth/token',
    userInfoUrl: 'https://gitlab.com/api/v4/user',
    scopes: 'read_user email',
    userMapping: (userInfo: any): OAuthUserInfo => ({
      id: userInfo.id.toString(),
      email: userInfo.email,
      name: userInfo.name,
      username: userInfo.username
    })
  }
};
