import { API_BASE_URL } from './config.mjs';
import { saveTokens } from './auth.mjs';
import { initializeStorage } from './storage.mjs';
import { setupNetworkListeners } from './events.mjs';

/**
 * @description SVG icons for known OAuth providers.
 */
const PROVIDER_ICONS = {
  google: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
    <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
    <path d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z" fill="#FBBC05"/>
    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
  </svg>`,
  github: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
  </svg>`,
  microsoft: `<svg width="18" height="18" viewBox="0 0 23 23" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M0 0h11v11H0z" fill="#F25022"/>
    <path d="M12 0h11v11H12z" fill="#7FBA00"/>
    <path d="M0 12h11v11H0z" fill="#00A4EF"/>
    <path d="M12 12h11v11H12z" fill="#FFB900"/>
  </svg>`,
  gitlab: `<svg width="18" height="18" viewBox="0 0 24 24" fill="#FC6D26" xmlns="http://www.w3.org/2000/svg">
    <path d="M23.546 10.93L13.067.452c-.604-.603-1.582-.603-2.188 0L.452 10.93c-.6.605-.6 1.584 0 2.188l10.427 10.426c.603.602 1.582.602 2.188 0l10.48-10.478c.6-.603.6-1.582 0-2.187zm-11.544 11.07L2.468 12.467l9.534-9.533 9.534 9.533-9.534 9.534z"/>
  </svg>`
};

/**
 * @description Get the SVG icon for a known OAuth provider.
 */
export function getProviderIcon(providerId) {
  return PROVIDER_ICONS[providerId] || '';
}

/**
 * @description Fetch available OAuth providers from the backend.
 * Uses a direct fetch to avoid token refresh logic in apiRequest.
 */
export async function fetchOAuthProviders() {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/oauth/providers`);
    if (!response.ok) return [];
    const data = await response.json();
    return data.providers || [];
  } catch {
    return [];
  }
}

/**
 * @description Redirect the user to the OAuth provider's authorization page.
 */
export function initiateOAuth(providerId) {
  window.location.href = `${API_BASE_URL}/auth/oauth/${providerId}`;
}

/**
 * @description Check if the current page load is an OAuth callback
 * (i.e. the server redirected back with tokens or an error in query params).
 */
export function isOAuthCallback() {
  const params = new URLSearchParams(window.location.search);
  return params.has('access_token') || params.has('oauth_error');
}

/**
 * @description Handle the OAuth callback by extracting tokens from the URL,
 * initializing storage, saving tokens, and preparing the app.
 */
export async function handleOAuthCallback() {
  const params = new URLSearchParams(window.location.search);

  const error = params.get('oauth_error');
  if (error) {
    window.history.replaceState({}, document.title, window.location.pathname);
    throw new Error(error);
  }

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const expiresIn = params.get('expires_in');

  if (!accessToken) throw new Error('No access token received');

  await initializeStorage();

  await saveTokens({
    accessToken,
    refreshToken,
    exp: parseInt(expiresIn, 10) || 900
  });

  setupNetworkListeners();

  window.history.replaceState({}, document.title, window.location.pathname);
}
