import type { OAuthConfiguration, OAuthProviderConfig } from './interfaces';
import { OAUTH_PRESETS } from './OAuthPresets';

/**
 * @description Resolve OAuth providers from configuration.
 * Combines preset providers (Google, GitHub, etc.) with custom providers.
 */
export function resolveOAuthProviders(
  config: OAuthConfiguration
): OAuthProviderConfig[] {
  const providers: OAuthProviderConfig[] = [];

  if (config.presets) {
    for (const [presetName, credentials] of Object.entries(config.presets)) {
      const preset = OAUTH_PRESETS[presetName];

      if (!preset) {
        console.warn(`[OAuth] Unknown preset provider: ${presetName}`);
        continue;
      }

      providers.push({
        ...preset,
        clientId: credentials.clientId,
        clientSecret: credentials.clientSecret,
        redirectUri: credentials.redirectUri,
        scopes: credentials.scopes || preset.scopes,
        authorizationParams: {
          ...preset.authorizationParams,
          ...credentials.authorizationParams
        }
      });
    }
  }

  if (config.custom) {
    providers.push(...config.custom);
  }

  return providers;
}
