import type { AuthMode } from '../interfaces';
import type { OAuthConfiguration } from '../oauth/interfaces';
import { resolveOAuthProviders } from '../oauth/OAuthProviderResolver';

export type PublicRuntimeConfigInput = {
  authMode: AuthMode;
  hasEmailConfig: boolean;
  isInviteRequired: boolean;
  oauth?: OAuthConfiguration;
};

export function createPublicRuntimeConfig(input: PublicRuntimeConfigInput) {
  const oauthProviders = input.oauth ? resolveOAuthProviders(input.oauth) : [];

  return {
    auth: {
      mode: input.authMode,
      hasEmail: input.hasEmailConfig,
      isInviteRequired: input.isInviteRequired,
      oauthEnabled: oauthProviders.length > 0,
      passwordResetEnabled: input.authMode === 'password' && input.hasEmailConfig,
      registrationEnabled: input.authMode === 'password' && !input.isInviteRequired,
      routes: {
        config: '/config.json',
        devLogin: '/auth/dev-login',
        login: '/auth/login',
        logout: '/auth/logout',
        me: '/auth/me',
        oauthProviders: '/auth/oauth/providers',
        passwordLogin: '/auth/password-login',
        passwordReset: '/auth/request-password-reset',
        refresh: '/auth/refresh',
        register: '/auth/register',
        setupPassword: '/auth/setup-password',
        verify: '/auth/verify'
      }
    }
  };
}
