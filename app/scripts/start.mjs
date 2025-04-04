/**
 * @description Handle top-level activities that happen on start/load.
 */
async function handleStart() {
  try {
    showLoading();

    // Disallow magic link URL handling if not using the magic link auth mode
    if (isMagicLinkUrl() && AUTH_MODE !== 'magic-link') window.location = '/';

    // We always need to check for the encryption key if this is not shared, regardless if user is authed or not
    if (isEncryptionPasswordRequired()) return await showAuthScreen();

    // Send unauthenticated users (with no record of relevant localStorage data) to the auth screen
    if (!isAuthenticated()) return await showAuthScreen();

    // User is already authenticated so it's safe to set up storage
    // using the default password and jump right into the app
    await initializeStorage();

    return await showAppScreen();
  } catch (error) {
    console.error('Error while checking if authenticated:', error);
    showToast('Failed to initialize the application', 'error');
    hideLoading();
    return await showAuthScreen();
  }
}
