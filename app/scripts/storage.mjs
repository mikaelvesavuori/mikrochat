// Storage-specific globals
const INIT_KEY = '_storage_initialized_';

/**
 * @description Set up storage depending on server settings.
 */
async function initializeStorage(password) {
  const fixedPassword = password || DEFAULT_PASSWORD;

  if (DEBUG_MODE)
    console.log('Initializing storage with password', fixedPassword);

  try {
    if (!ENABLE_USER_SPECIFIC_ENCRYPTION) {
      if (DEBUG_MODE)
        console.log('Setting up default encryption...', fixedPassword);
      await setupStorage(fixedPassword, true);

      return true;
    }

    const hasExistingData = checkForExistingData();

    if (hasExistingData) {
      try {
        await setupStorage(fixedPassword, false);
        const result = await storage.getItem(INIT_KEY);

        return result === 'true';
      } catch (error) {
        console.error(
          'Failed to decrypt existing data with provided password:',
          error
        );

        return false;
      }
    } else {
      if (DEBUG_MODE)
        console.log('Setting up custom encryption...', fixedPassword);
      await setupStorage(fixedPassword, true);
      await storage.setItem(INIT_KEY, 'true');

      return true;
    }
  } catch (error) {
    console.error('Failed to initialize storage:', error);

    return false;
  }
}

/**
 * @description Set up storage using MikroSafe.
 * @see https://github.com/mikaelvesavuori/mikrosafe
 */
async function setupStorage(password, setInitItem = true) {
  const mikrosafe = await new MikroSafe(password);
  storage = mikrosafe;
  isStorageInitialized = true;
  if (setInitItem) await storage.setItem(INIT_KEY, 'true');
}

/**
 * @description Checks if the user already seems to have existing data from previous use.
 */
function checkForExistingData() {
  const storageKeys = Object.keys(localStorage);
  const hasInitKey = storageKeys.includes(INIT_KEY);
  const hasTokenOrAccessToken =
    storageKeys.includes('token') || storageKeys.includes('accessToken');

  return hasInitKey && hasTokenOrAccessToken;
}

/**
 * @description Checks if the password matches the expected encryption password
 * This is done by seeing if the initialization key can be properly read back.
 */
async function verifyEncryptionPassword(password) {
  try {
    const storageInitialized = await initializeStorage(password);
    if (!storageInitialized) return false;

    const isVerified = await storage.getItem(INIT_KEY);
    return isVerified === 'true';
  } catch (error) {
    console.error('Error verifying encryption password:', error);
    return false;
  }
}
