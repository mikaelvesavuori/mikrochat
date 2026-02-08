import { type IdConfigurationOptions, MikroID } from 'mikroid';

import type { AuthMode } from '../interfaces';

export const idName = 'mikrochat_id';
export const idConfig: IdConfigurationOptions = {
  name: idName,
  length: 12,
  urlSafe: true
};

export const configDefaults = () => {
  const debug = getTruthyValue(process.env.DEBUG) || false;

  return {
    auth: {
      jwtSecret: process.env.AUTH_JWT_SECRET || 'your-jwt-secret',
      magicLinkExpirySeconds: 15 * 60, // 15 minutes
      jwtExpirySeconds: 15 * 60, // 15 minutes
      refreshTokenExpirySeconds: 7 * 24 * 60 * 60, // 7 days
      maxActiveSessions: 3,
      appUrl: process.env.APP_URL || 'http://127.0.0.1:3000',
      authMode: 'magic-link' as AuthMode,
      isInviteRequired: true,
      debug
    },
    email: {
      emailSubject: 'Your Secure Login Link',
      user: process.env.EMAIL_USER || '',
      host: process.env.EMAIL_HOST || '',
      password: process.env.EMAIL_PASSWORD || '',
      port: 465,
      secure: true,
      maxRetries: 2,
      debug
    },
    storage: {
      databaseDirectory: 'mikrochat_db',
      encryptionKey: process.env.STORAGE_KEY || '',
      debug
    },
    server: {
      port: Number(process.env.PORT) || 3000,
      host: process.env.HOST || 'localhost',
      useHttps: false,
      useHttp2: false,
      sslCert: '',
      sslKey: '',
      sslCa: '',
      rateLimit: {
        enabled: true,
        requestsPerMinute: 100
      },
      allowedDomains: ['http://127.0.0.1:8000'],
      debug
    },
    chat: {
      initialUser: {
        id: process.env.INITIAL_USER_ID || new MikroID().add(idConfig),
        userName: process.env.INITIAL_USER_NAME || '',
        email: process.env.INITIAL_USER_EMAIL || '',
        password: process.env.INITIAL_USER_PASSWORD || ''
      },
      messageRetentionDays: 30,
      maxMessagesPerChannel: 100
    },
    oauth: undefined as undefined
  };
};

/**
 * @description Get a value and check if it's a string or boolean true.
 */
function getTruthyValue(value: string | boolean | undefined) {
  if (value === 'true' || value === true) return true;
  return false;
}
