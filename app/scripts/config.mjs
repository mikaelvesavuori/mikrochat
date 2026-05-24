/**
 * @description MikroChat Front-End Configuration
 *
 * Values are read from window.MIKROCHAT_CONFIG (set in config.js).
 * Defaults are used as fallbacks if a value is missing.
 */

const cfg = window.MIKROCHAT_CONFIG || {};

export const DEBUG_MODE = cfg.DEBUG_MODE ?? false;
export const API_BASE_URL = cfg.API_BASE_URL ?? 'http://127.0.0.1:3000';
export const MAX_CONTENT_LENGTH = cfg.MAX_CONTENT_LENGTH ?? 1000;

if (DEBUG_MODE) {
  console.table([
    { flag: 'API_BASE_URL', setting: API_BASE_URL },
    {
      flag: 'MAX_CONTENT_LENGTH',
      setting: MAX_CONTENT_LENGTH
    }
  ]);

  console.log(`Has ${window.localStorage.length} items in localStorage`);
}
