import { describe, expect, it } from 'vitest';

import { createPublicRuntimeConfig } from '../src/server/publicConfig';

describe('createPublicRuntimeConfig', () => {
  it('exposes only safe auth capabilities for magic-link mode', () => {
    const config = createPublicRuntimeConfig({
      authMode: 'magic-link',
      hasEmailConfig: true,
      isInviteRequired: true
    });

    expect(config.auth).toMatchObject({
      mode: 'magic-link',
      hasEmail: true,
      isInviteRequired: true,
      oauthEnabled: false,
      passwordResetEnabled: false,
      registrationEnabled: false
    });
    expect(config.auth.routes.config).toBe('/config.json');
    expect(config.auth.routes.verify).toBe('/auth/verify');
  });

  it('exposes password registration and reset capability from server settings', () => {
    const config = createPublicRuntimeConfig({
      authMode: 'password',
      hasEmailConfig: true,
      isInviteRequired: false
    });

    expect(config.auth).toMatchObject({
      mode: 'password',
      hasEmail: true,
      isInviteRequired: false,
      passwordResetEnabled: true,
      registrationEnabled: true
    });
  });

  it('reports OAuth as enabled when at least one provider resolves', () => {
    const config = createPublicRuntimeConfig({
      authMode: 'password',
      hasEmailConfig: false,
      isInviteRequired: true,
      oauth: {
        presets: {
          github: {
            clientId: 'client-id',
            clientSecret: 'client-secret',
            redirectUri: 'https://chat.example.com/auth/oauth/github/callback'
          }
        }
      }
    });

    expect(config.auth.oauthEnabled).toBe(true);
  });
});
