import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { configDefaults, idName, idConfig } from '../src/config/configDefaults';

describe('idName', () => {
  it('should equal "mikrochat_id"', () => {
    expect(idName).toBe('mikrochat_id');
  });
});

describe('idConfig', () => {
  it('should use the idName as name', () => {
    expect(idConfig.name).toBe(idName);
  });

  it('should have length 12', () => {
    expect(idConfig.length).toBe(12);
  });

  it('should be URL-safe', () => {
    expect(idConfig.urlSafe).toBe(true);
  });
});

describe('configDefaults', () => {
  beforeEach(() => {
    vi.stubEnv('DEBUG', '');
    vi.stubEnv('AUTH_JWT_SECRET', '');
    vi.stubEnv('APP_URL', '');
    vi.stubEnv('EMAIL_USER', '');
    vi.stubEnv('EMAIL_HOST', '');
    vi.stubEnv('EMAIL_PASSWORD', '');
    vi.stubEnv('STORAGE_KEY', '');
    vi.stubEnv('PORT', '');
    vi.stubEnv('HOST', '');
    vi.stubEnv('INITIAL_USER_ID', '');
    vi.stubEnv('INITIAL_USER_NAME', '');
    vi.stubEnv('INITIAL_USER_EMAIL', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('auth defaults', () => {
    it('should default jwtSecret to "your-jwt-secret"', () => {
      const config = configDefaults();
      expect(config.auth.jwtSecret).toBe('your-jwt-secret');
    });

    it('should use AUTH_JWT_SECRET env var when set', () => {
      vi.stubEnv('AUTH_JWT_SECRET', 'my-secret');
      const config = configDefaults();
      expect(config.auth.jwtSecret).toBe('my-secret');
    });

    it('should set magicLinkExpirySeconds to 15 minutes', () => {
      const config = configDefaults();
      expect(config.auth.magicLinkExpirySeconds).toBe(900);
    });

    it('should set jwtExpirySeconds to 15 minutes', () => {
      const config = configDefaults();
      expect(config.auth.jwtExpirySeconds).toBe(900);
    });

    it('should set refreshTokenExpirySeconds to 7 days', () => {
      const config = configDefaults();
      expect(config.auth.refreshTokenExpirySeconds).toBe(604800);
    });

    it('should set maxActiveSessions to 3', () => {
      const config = configDefaults();
      expect(config.auth.maxActiveSessions).toBe(3);
    });

    it('should default appUrl to "http://127.0.0.1:3000"', () => {
      const config = configDefaults();
      expect(config.auth.appUrl).toBe('http://127.0.0.1:3000');
    });

    it('should use APP_URL env var when set', () => {
      vi.stubEnv('APP_URL', 'https://example.com');
      const config = configDefaults();
      expect(config.auth.appUrl).toBe('https://example.com');
    });

    it('should default authMode to "magic-link"', () => {
      const config = configDefaults();
      expect(config.auth.authMode).toBe('magic-link');
    });

    it('should default isInviteRequired to true', () => {
      const config = configDefaults();
      expect(config.auth.isInviteRequired).toBe(true);
    });

    it('should default debug to false', () => {
      const config = configDefaults();
      expect(config.auth.debug).toBe(false);
    });
  });

  describe('email defaults', () => {
    it('should set emailSubject', () => {
      const config = configDefaults();
      expect(config.email.emailSubject).toBe('Your Secure Login Link');
    });

    it('should default user to empty string', () => {
      const config = configDefaults();
      expect(config.email.user).toBe('');
    });

    it('should use EMAIL_USER env var when set', () => {
      vi.stubEnv('EMAIL_USER', 'me@example.com');
      const config = configDefaults();
      expect(config.email.user).toBe('me@example.com');
    });

    it('should default host to empty string', () => {
      const config = configDefaults();
      expect(config.email.host).toBe('');
    });

    it('should use EMAIL_HOST env var when set', () => {
      vi.stubEnv('EMAIL_HOST', 'smtp.example.com');
      const config = configDefaults();
      expect(config.email.host).toBe('smtp.example.com');
    });

    it('should default password to empty string', () => {
      const config = configDefaults();
      expect(config.email.password).toBe('');
    });

    it('should use EMAIL_PASSWORD env var when set', () => {
      vi.stubEnv('EMAIL_PASSWORD', 'secret');
      const config = configDefaults();
      expect(config.email.password).toBe('secret');
    });

    it('should set port to 465', () => {
      const config = configDefaults();
      expect(config.email.port).toBe(465);
    });

    it('should set secure to true', () => {
      const config = configDefaults();
      expect(config.email.secure).toBe(true);
    });

    it('should set maxRetries to 2', () => {
      const config = configDefaults();
      expect(config.email.maxRetries).toBe(2);
    });
  });

  describe('storage defaults', () => {
    it('should set databaseDirectory to "mikrochat_db"', () => {
      const config = configDefaults();
      expect(config.storage.databaseDirectory).toBe('mikrochat_db');
    });

    it('should default encryptionKey to empty string', () => {
      const config = configDefaults();
      expect(config.storage.encryptionKey).toBe('');
    });

    it('should use STORAGE_KEY env var when set', () => {
      vi.stubEnv('STORAGE_KEY', 'enc-key-123');
      const config = configDefaults();
      expect(config.storage.encryptionKey).toBe('enc-key-123');
    });
  });

  describe('server defaults', () => {
    it('should default port to 3000', () => {
      const config = configDefaults();
      expect(config.server.port).toBe(3000);
    });

    it('should use PORT env var when set', () => {
      vi.stubEnv('PORT', '8080');
      const config = configDefaults();
      expect(config.server.port).toBe(8080);
    });

    it('should default host to "localhost"', () => {
      const config = configDefaults();
      expect(config.server.host).toBe('localhost');
    });

    it('should use HOST env var when set', () => {
      vi.stubEnv('HOST', '0.0.0.0');
      const config = configDefaults();
      expect(config.server.host).toBe('0.0.0.0');
    });

    it('should default useHttps to false', () => {
      const config = configDefaults();
      expect(config.server.useHttps).toBe(false);
    });

    it('should default useHttp2 to false', () => {
      const config = configDefaults();
      expect(config.server.useHttp2).toBe(false);
    });

    it('should default SSL fields to empty strings', () => {
      const config = configDefaults();
      expect(config.server.sslCert).toBe('');
      expect(config.server.sslKey).toBe('');
      expect(config.server.sslCa).toBe('');
    });

    it('should enable rate limiting with 100 requests per minute', () => {
      const config = configDefaults();
      expect(config.server.rateLimit).toEqual({
        enabled: true,
        requestsPerMinute: 100
      });
    });

    it('should set allowedDomains to localhost:8000', () => {
      const config = configDefaults();
      expect(config.server.allowedDomains).toEqual(['http://127.0.0.1:8000']);
    });
  });

  describe('chat defaults', () => {
    it('should fall back to MikroID-generated id when INITIAL_USER_ID is not set', () => {
      const config = configDefaults();
      expect(config.chat.initialUser.id).not.toBe('custom-id');
    });

    it('should use INITIAL_USER_ID env var when set', () => {
      vi.stubEnv('INITIAL_USER_ID', 'custom-id');
      const config = configDefaults();
      expect(config.chat.initialUser.id).toBe('custom-id');
    });

    it('should default initialUser userName to empty string', () => {
      const config = configDefaults();
      expect(config.chat.initialUser.userName).toBe('');
    });

    it('should use INITIAL_USER_NAME env var when set', () => {
      vi.stubEnv('INITIAL_USER_NAME', 'admin');
      const config = configDefaults();
      expect(config.chat.initialUser.userName).toBe('admin');
    });

    it('should default initialUser email to empty string', () => {
      const config = configDefaults();
      expect(config.chat.initialUser.email).toBe('');
    });

    it('should use INITIAL_USER_EMAIL env var when set', () => {
      vi.stubEnv('INITIAL_USER_EMAIL', 'admin@test.com');
      const config = configDefaults();
      expect(config.chat.initialUser.email).toBe('admin@test.com');
    });

    it('should set messageRetentionDays to 30', () => {
      const config = configDefaults();
      expect(config.chat.messageRetentionDays).toBe(30);
    });

    it('should set maxMessagesPerChannel to 100', () => {
      const config = configDefaults();
      expect(config.chat.maxMessagesPerChannel).toBe(100);
    });
  });

  describe('oauth', () => {
    it('should default oauth to undefined', () => {
      const config = configDefaults();
      expect(config.oauth).toBeUndefined();
    });
  });

  describe('debug flag via DEBUG env var', () => {
    it('should set debug to true when DEBUG is "true"', () => {
      vi.stubEnv('DEBUG', 'true');
      const config = configDefaults();
      expect(config.auth.debug).toBe(true);
      expect(config.email.debug).toBe(true);
      expect(config.storage.debug).toBe(true);
      expect(config.server.debug).toBe(true);
    });

    it('should set debug to false when DEBUG is "false"', () => {
      vi.stubEnv('DEBUG', 'false');
      const config = configDefaults();
      expect(config.auth.debug).toBe(false);
    });

    it('should set debug to false when DEBUG is any other string', () => {
      vi.stubEnv('DEBUG', 'yes');
      const config = configDefaults();
      expect(config.auth.debug).toBe(false);
    });
  });
});
