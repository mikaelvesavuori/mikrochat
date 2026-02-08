/**
 * @description MikroChat Front-End Configuration
 *
 * Values are read from window.MIKROCHAT_CONFIG (set in config.js).
 * Defaults are used as fallbacks if a value is missing.
 */

const cfg = window.MIKROCHAT_CONFIG || {};

export const DEBUG_MODE = cfg.DEBUG_MODE ?? false;
export const AUTH_MODE = cfg.AUTH_MODE ?? 'password';
export const API_BASE_URL = cfg.API_BASE_URL ?? 'http://localhost:3000';
export const DEFAULT_PASSWORD = cfg.DEFAULT_PASSWORD ?? '';
export const ENABLE_USER_SPECIFIC_ENCRYPTION =
  cfg.ENABLE_USER_SPECIFIC_ENCRYPTION ?? false;
export const HAS_EMAIL = cfg.HAS_EMAIL ?? false;
export const ENABLE_OAUTH = cfg.ENABLE_OAUTH ?? false;
export const MAX_CONTENT_LENGTH = cfg.MAX_CONTENT_LENGTH ?? 1000;

if (DEBUG_MODE) {
  console.table([
    { flag: 'AUTH_MODE', setting: AUTH_MODE },
    { flag: 'API_BASE_URL', setting: API_BASE_URL },
    { flag: 'DEFAULT_PASSWORD', setting: DEFAULT_PASSWORD },
    {
      flag: 'ENABLE_USER_SPECIFIC_ENCRYPTION',
      setting: ENABLE_USER_SPECIFIC_ENCRYPTION
    },
    {
      flag: 'HAS_EMAIL',
      setting: HAS_EMAIL
    },
    {
      flag: 'ENABLE_OAUTH',
      setting: ENABLE_OAUTH
    },
    {
      flag: 'MAX_CONTENT_LENGTH',
      setting: MAX_CONTENT_LENGTH
    }
  ]);

  console.log(`Has ${window.localStorage.length} items in localStorage`);
}
