import { AUTH_MODE } from './config.mjs';
import { isEncryptionPasswordRequired, isAuthenticated } from './auth.mjs';
import { initializeStorage } from './storage.mjs';
import { isMagicLinkUrl } from './magiclink.mjs';
import { showToast, showLoading, hideLoading, showAuthScreen, showAppScreen, requestNotificationPermission } from './ui.mjs';
import { setupNetworkListeners } from './events.mjs';

/**
 * @description Handle top-level activities that happen on start/load.
 */
export async function handleStart() {
  try {
    showLoading();

    // Allow magic link URLs for both magic-link and password auth modes (password uses them for invites)
    if (isMagicLinkUrl() && AUTH_MODE !== 'magic-link' && AUTH_MODE !== 'password')
      window.location = '/';

    // Password invite URLs should always go to the auth screen for password setup
    if (isMagicLinkUrl() && AUTH_MODE === 'password') return await showAuthScreen();

    // We always need to check for the encryption key if this is not shared, regardless if user is authed or not
    if (isEncryptionPasswordRequired()) return await showAuthScreen();

    // Send unauthenticated users (with no record of relevant localStorage data) to the auth screen
    if (!isAuthenticated()) return await showAuthScreen();

    // User is already authenticated so it's safe to set up storage
    // using the default password and jump right into the app
    await initializeStorage();

    requestNotificationPermission();
    setupNetworkListeners();

    return await showAppScreen();
  } catch (error) {
    console.error('Error while checking if authenticated:', error);
    showToast('Failed to initialize the application', 'error');
    hideLoading();
    return await showAuthScreen();
  }
}
