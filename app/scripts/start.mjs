import { isAuthenticated } from './auth.mjs';
import { isMagicLinkUrl } from './magiclink.mjs';
import { isOAuthCallback, handleOAuthCallback } from './oauth.mjs';
import { getAuthMode, loadRuntimeConfig } from './runtime-config.mjs';
import { showToast, showLoading, hideLoading, showAuthScreen, showAppScreen } from './ui.mjs';
import { setupNetworkListeners } from './events.mjs';

/**
 * @description Handle top-level activities that happen on start/load.
 */
export async function handleStart() {
  try {
    showLoading();
    await loadRuntimeConfig();
    const authMode = getAuthMode();

    // Handle OAuth callback (tokens in URL from server redirect)
    if (isOAuthCallback()) {
      try {
        await handleOAuthCallback();
        showToast('Successfully logged in!');
        return await showAppScreen();
      } catch (error) {
        hideLoading();
        showToast(error.message || 'OAuth sign-in failed', 'error');
        return await showAuthScreen();
      }
    }

    // Allow magic link URLs for both magic-link and password auth modes (password uses them for invites)
    if (isMagicLinkUrl() && authMode !== 'magic-link' && authMode !== 'password')
      window.location = '/';

    // Password invite URLs should always go to the auth screen for password setup
    if (isMagicLinkUrl() && authMode === 'password') return await showAuthScreen();

    // Send unauthenticated users (with no record of relevant localStorage data) to the auth screen
    if (!isAuthenticated()) return await showAuthScreen();

    setupNetworkListeners();

    return await showAppScreen();
  } catch (error) {
    console.error('Error while checking if authenticated:', error);
    showToast('Failed to initialize the application', 'error');
    hideLoading();
    return await showAuthScreen();
  }
}
