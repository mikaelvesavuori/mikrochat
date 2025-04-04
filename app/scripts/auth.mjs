/**
 * @description Save tokens to localStorage.
 */
async function saveTokens(tokens) {
  try {
    await storage.setItem('accessToken', tokens.accessToken);
    await storage.setItem('refreshToken', tokens.refreshToken);
    await storage.setItem('exp', Date.now() + tokens.exp * 1000);

    return true;
  } catch (error) {
    console.error('Failed to save tokens:', error);
    return false;
  }
}

/**
 * @description Get tokens from localStorage.
 */
async function getTokens() {
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
async function getAccessToken() {
  return (
    (await storage.getItem('token')) || (await storage.getItem('accessToken'))
  );
}

/**
 * @description Get the refresh token from localStorage.
 */
async function getRefreshToken() {
  return await storage.getItem('refreshToken');
}

/**
 * @description Removes tokens from localStorage.
 */
async function clearTokens() {
  try {
    await storage.removeItem('accessToken');
    await storage.removeItem('refreshToken');

    return true;
  } catch (error) {
    console.error('Failed to clear tokens:', error);
    return false;
  }
}

/**
 * @description Checks if token(s) are expired.
 */
async function isTokenExpired() {
  const tokens = await getTokens();
  if (!tokens) return true;

  const bufferInSeconds = 10;
  return Date.now() > tokens.exp - bufferInSeconds * 1000;
}

/**
 * @description Parse a token to get its data.
 */
function parseToken(token) {
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
async function getUserInfo() {
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
async function verifyToken(urlParams) {
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
async function refreshTokens() {
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
async function signout() {
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
function cleanup() {
  localStorage.clear();
  storage.clear();
  storage = null;

  currentUser = null;

  if (messageEventSource) {
    messageEventSource.close();
    messageEventSource = null;
  }

  tempIdMap = new Map();
  messageCache = new Map();
  unreadCounts = new Map();

  window.location = '/';

  showToast('You have been signed out');
}

/**
 * @description Checks if the encryption password screen should be shown.
 */
function isEncryptionPasswordRequired() {
  return ENABLE_USER_SPECIFIC_ENCRYPTION;
}

/**
 * @description Checks if the user can be deemed authenticated through
 * the context, i.e. there is relevant prior localStorage data.
 */
function isAuthenticated() {
  return checkForExistingData();
}

/**
 * @description Sign the user in to MikroChat.
 */
async function signin(email, encryptionPassword) {
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

    hideLoading();
  } catch (error) {
    hideLoading();
    showToast(error.message || 'Failed to log in', 'error');
  }
}

/**
 * @description Handle signing users in during dev mode.
 */
async function handleDevModeSignIn(email) {
  const response = await apiRequest('/auth/dev-login', 'POST', { email });
  await storage.setItem('token', response.token);
  currentUser = response.user;

  showToast('Successfully logged in!');
  return await showAppScreen();
}

/**
 * @description Handle signing users when using magic links.
 */
async function handleMagicLinkSignIn() {
  await verifyMagicLink();
  showToast('Successfully logged in!');
  return await showAppScreen();
}
