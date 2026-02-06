/**
 * @description MikroChat Front-End Configuration
 */

export const DEBUG_MODE = true;
export const AUTH_MODE = 'dev'; // Options: "dev", "magic-link", "password"
export const API_BASE_URL = 'http://localhost:3000';
export const DEFAULT_PASSWORD = '$J2Ek<wp5Wsp+x!FsGb[';
export const ENABLE_USER_SPECIFIC_ENCRYPTION = false;
export const MAX_CONTENT_LENGTH = 1000;

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
      flag: 'MAX_CONTENT_LENGTH',
      setting: MAX_CONTENT_LENGTH
    }
  ]);

  console.log(`Has ${window.localStorage.length} items in localStorage`);
}
