import { state } from './state.mjs';
import {
  encryptionPasswordInput,
  authPasswordInput,
  authPasswordConfirmInput
} from './dom.mjs';
import {
  AUTH_MODE,
  DEFAULT_PASSWORD,
  ENABLE_USER_SPECIFIC_ENCRYPTION
} from './config.mjs';
import { isValidEmail } from './utils.mjs';
import {
  initializeStorage,
  checkForExistingData,
  verifyEncryptionPassword
} from './storage.mjs';
import { isMagicLinkUrl, verifyMagicLink } from './magiclink.mjs';
import { getUrlParams } from './url.mjs';
// Note: apiRequest imported dynamically to avoid circular dependency at module load time
// showToast, showLoading, hideLoading, showAppScreen, renderNewMagicLink imported from ui.mjs

/**
 * @description Save tokens to localStorage.
 */
export async function saveTokens(tokens) {
  try {
    await state.storage.setItem('accessToken', tokens.accessToken);
    await state.storage.setItem('refreshToken', tokens.refreshToken);
    await state.storage.setItem('exp', Date.now() + tokens.exp * 1000);

    return true;
  } catch (error) {
    console.error('Failed to save tokens:', error);
    return false;
  }
}

/**
 * @description Get tokens from localStorage.
 */
export async function getTokens() {
  try {
    return {
      accessToken: await getAccessToken(),
      refreshToken: await getRefreshToken()
    };
  } catch (error) {
    console.error('Failed to get tokens:', error);
    return null;
  }
}

/**
 * @description Get the accessToken or token, depending on which is available.
 * This will thus handle both regular and dev login cases.
 */
export async function getAccessToken() {
  return (
    (await state.storage.getItem('token')) ||
    (await state.storage.getItem('accessToken'))
  );
}

/**
 * @description Get the refresh token from localStorage.
 */
export async function getRefreshToken() {
  return await state.storage.getItem('refreshToken');
}

/**
 * @description Removes tokens from localStorage.
 */
export async function clearTokens() {
  try {
    await state.storage.removeItem('accessToken');
    await state.storage.removeItem('refreshToken');

    return true;
  } catch (error) {
    console.error('Failed to clear tokens:', error);
    return false;
  }
}

/**
 * @description Checks if token(s) are expired.
 */
export async function isTokenExpired() {
  const tokens = await getTokens();
  if (!tokens) return true;

  const bufferInSeconds = 10;
  return Date.now() > tokens.exp - bufferInSeconds * 1000;
}

/**
 * @description Parse a token to get its data.
 */
export function parseToken(token) {
  if (!token) return null;

  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => `%${(`00${c.charCodeAt(0).toString(16)}`).slice(-2)}`)
        .join('')
    );

    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error('Failed to parse token:', error);
    return null;
  }
}

/**
 * @description Get user information from the backend, using the user's access token.
 */
export async function getUserInfo() {
  const { apiRequest } = await import('./api.mjs');
  const token = await getAccessToken();
  if (!token) return;

  const { user } = await apiRequest('/auth/me', 'GET');
  if (!user) return;

  const tokenData = parseToken(token);
  if (!tokenData) return;

  return {
    id: user.id,
    userName: user.userName,
    email: user.sub,
    isAdmin: user.isAdmin,
    lastLogin: tokenData.lastLogin,
    metadata: tokenData.metadata
  };
}

/**
 * @description Verify a magic link token.
 */
export async function verifyToken(urlParams) {
  const { apiRequest } = await import('./api.mjs');
  try {
    const response = await apiRequest(
      '/auth/verify',
      'POST',
      {
        email: urlParams.email
      },
      urlParams.token
    );

    await saveTokens(response);

    return response;
  } catch (error) {
    console.error('Error while verifying token:', error);
    return false;
  }
}

/**
 * @description Refreshes the user's tokens.
 */
export async function refreshTokens() {
  const { apiRequest } = await import('./api.mjs');
  const refreshToken = await getRefreshToken();
  if (!refreshToken) throw new Error('No refresh token available');

  try {
    const response = await apiRequest('/auth/refresh', 'POST', {
      refreshToken
    });

    if (!response.ok) throw new Error('Failed to refresh token');

    await saveTokens(response);
    return response;
  } catch (error) {
    await clearTokens();
    throw error;
  }
}

/**
 * @description Log out (sign out) the user.
 */
export async function signout() {
  const { apiRequest } = await import('./api.mjs');
  const { accessToken, refreshToken } = await getTokens();

  // If there is a lack of tokens, let's defensively sign out the user; likely to be dev mode
  if (!accessToken || !refreshToken) {
    cleanup();
    return;
  }

  await apiRequest('/auth/logout', 'POST', {
    refreshToken
  }).then((res) => {
    if (res.error) throw new Error('Failed to logout');
    cleanup();
  });
}

/**
 * @description Defensively perform post-signout cleanup activities.
 */
export async function cleanup() {
  const { showToast } = await import('./ui.mjs');

  localStorage.clear();
  state.storage.clear();
  state.storage = null;

  state.currentUser = null;

  if (state.messageEventSource) {
    state.messageEventSource.close();
    state.messageEventSource = null;
  }

  state.tempIdMap = new Map();
  state.messageCache = new Map();
  state.unreadCounts = new Map();

  window.location = '/';

  showToast('You have been signed out');
}

/**
 * @description Checks if the encryption password screen should be shown.
 */
export function isEncryptionPasswordRequired() {
  return ENABLE_USER_SPECIFIC_ENCRYPTION;
}

/**
 * @description Checks if the user can be deemed authenticated through
 * the context, i.e. there is relevant prior localStorage data.
 */
export function isAuthenticated() {
  return checkForExistingData();
}

/**
 * @description Sign the user in to MikroChat.
 */
export async function signin(email, encryptionPassword) {
  const {
    showToast,
    showLoading,
    hideLoading,
    showAppScreen,
    renderNewMagicLink
  } = await import('./ui.mjs');

  if (!email || !email.trim()) {
    showToast('Please enter your email', 'error');
    return;
  }

  if (!isValidEmail(email)) {
    showToast('Email appears invalid. Please check the input.', 'error');
    return;
  }

  // Only require this if the input element is actually visible
  if (
    encryptionPasswordInput.style.display === 'block' &&
    isEncryptionPasswordRequired() &&
    (!encryptionPassword || !encryptionPassword.trim())
  ) {
    showToast('Please enter your encryption password', 'error');
    return;
  }

  try {
    showLoading();

    const password = ENABLE_USER_SPECIFIC_ENCRYPTION
      ? encryptionPassword
      : DEFAULT_PASSWORD;

    const storageInitialized = await initializeStorage(password);
    if (!storageInitialized) {
      hideLoading();
      showToast('Invalid encryption key', 'error');
      return;
    }

    if (!isEncryptionPasswordRequired())
      encryptionPasswordInput.value = DEFAULT_PASSWORD;

    if (AUTH_MODE === 'dev') return await handleDevModeSignIn(email);

    if (AUTH_MODE === 'magic-link') {
      if (isMagicLinkUrl()) return await handleMagicLinkSignIn();

      const authed = isAuthenticated();

      if (authed) {
        const isValidPassword =
          await verifyEncryptionPassword(encryptionPassword);

        if (isValidPassword) {
          showToast('Successfully logged in!');
          return await showAppScreen();
        }

        showToast('Invalid password', 'error');
      } else {
        await renderNewMagicLink(email);
      }
    }

    if (AUTH_MODE === 'password') {
      const password = authPasswordInput?.value;
      const confirmPassword = authPasswordConfirmInput?.value;
      const { emailParam, tokenParam, resetParam } = getUrlParams();

      // Forgot password flow: user is requesting a reset email
      if (
        authPasswordInput &&
        authPasswordInput.offsetParent === null &&
        !emailParam &&
        !tokenParam
      ) {
        return await handleForgotPassword(email);
      }

      // Password reset flow: URL has email+token+reset, user is setting new password
      if (emailParam && tokenParam && resetParam) {
        if (!password || password.length < 8) {
          showToast('Password must be at least 8 characters', 'error');
          hideLoading();
          return;
        }
        if (password !== confirmPassword) {
          showToast('Passwords do not match', 'error');
          hideLoading();
          return;
        }
        return await handlePasswordSetup(emailParam, tokenParam, password);
      }

      // Invite setup flow: URL has email+token, user is setting password
      if (emailParam && tokenParam) {
        if (!password || password.length < 8) {
          showToast('Password must be at least 8 characters', 'error');
          hideLoading();
          return;
        }
        if (password !== confirmPassword) {
          showToast('Passwords do not match', 'error');
          hideLoading();
          return;
        }
        return await handlePasswordSetup(emailParam, tokenParam, password);
      }

      // Registration flow: confirm password field is visible
      if (
        authPasswordConfirmInput &&
        authPasswordConfirmInput.offsetParent !== null
      ) {
        if (!password || password.length < 8) {
          showToast('Password must be at least 8 characters', 'error');
          hideLoading();
          return;
        }
        if (password !== confirmPassword) {
          showToast('Passwords do not match', 'error');
          hideLoading();
          return;
        }
        return await handlePasswordRegister(email, password);
      }

      // Normal sign in
      if (!password) {
        showToast('Please enter your password', 'error');
        hideLoading();
        return;
      }
      return await handlePasswordSignIn(email, password);
    }

    hideLoading();
  } catch (error) {
    hideLoading();
    showToast(error.message || 'Failed to log in', 'error');
  }
}

/**
 * @description Handle signing users in during dev mode.
 */
export async function handleDevModeSignIn(email) {
  const { apiRequest } = await import('./api.mjs');
  const { showToast, showAppScreen } = await import('./ui.mjs');

  const response = await apiRequest('/auth/dev-login', 'POST', { email });
  await state.storage.setItem('token', response.token);
  state.currentUser = response.user;

  showToast('Successfully logged in!');
  return await showAppScreen();
}

/**
 * @description Handle signing users when using magic links.
 */
export async function handleMagicLinkSignIn() {
  const { showToast, showAppScreen } = await import('./ui.mjs');

  await verifyMagicLink();
  showToast('Successfully logged in!');
  return await showAppScreen();
}

/**
 * @description Handle password-based sign in.
 */
export async function handlePasswordSignIn(email, password) {
  const { apiRequest } = await import('./api.mjs');
  const { showToast, showAppScreen } = await import('./ui.mjs');

  const response = await apiRequest('/auth/password-login', 'POST', {
    email,
    password
  });

  if (response.error) throw new Error(response.error);

  await saveTokens(response);
  showToast('Successfully logged in!');
  return await showAppScreen();
}

/**
 * @description Handle password setup from invite link.
 */
export async function handlePasswordSetup(email, token, password) {
  const { apiRequest } = await import('./api.mjs');
  const { showToast, showAppScreen } = await import('./ui.mjs');

  const response = await apiRequest('/auth/setup-password', 'POST', {
    email,
    token,
    password
  });

  if (response.error) throw new Error(response.error);

  await saveTokens(response);
  showToast('Password set successfully!');
  return await showAppScreen();
}

/**
 * @description Handle self-registration with password.
 */
export async function handlePasswordRegister(email, password) {
  const { apiRequest } = await import('./api.mjs');
  const { showToast, showAppScreen } = await import('./ui.mjs');

  const response = await apiRequest('/auth/register', 'POST', {
    email,
    password
  });

  if (response.error) throw new Error(response.error);

  await saveTokens(response);
  showToast('Account created successfully!');
  return await showAppScreen();
}

/**
 * @description Handle forgot password: request a password reset email.
 */
export async function handleForgotPassword(email) {
  const { apiRequest } = await import('./api.mjs');
  const { hideLoading, renderPasswordResetSent } = await import('./ui.mjs');

  const response = await apiRequest('/auth/request-password-reset', 'POST', {
    email
  });

  hideLoading();
  renderPasswordResetSent(response.message);
}
