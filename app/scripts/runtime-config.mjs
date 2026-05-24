import { API_BASE_URL, DEBUG_MODE } from './config.mjs';
import { state } from './state.mjs';

const DEFAULT_RUNTIME_CONFIG = {
  auth: {
    mode: 'magic-link',
    hasEmail: false,
    isInviteRequired: true,
    oauthEnabled: false,
    passwordResetEnabled: false,
    registrationEnabled: false,
    routes: {
      config: '/config.json',
      devLogin: '/auth/dev-login',
      login: '/auth/login',
      logout: '/auth/logout',
      me: '/auth/me',
      oauthProviders: '/auth/oauth/providers',
      passwordLogin: '/auth/password-login',
      passwordReset: '/auth/request-password-reset',
      refresh: '/auth/refresh',
      register: '/auth/register',
      setupPassword: '/auth/setup-password',
      verify: '/auth/verify'
    }
  }
};

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function mergeConfig(baseConfig, overrideConfig) {
  const next = { ...baseConfig };

  for (const [key, value] of Object.entries(overrideConfig || {})) {
    if (isPlainObject(value) && isPlainObject(next[key])) {
      next[key] = mergeConfig(next[key], value);
      continue;
    }

    next[key] = value;
  }

  return next;
}

export async function loadRuntimeConfig({ force = false } = {}) {
  if (state.runtimeConfig && !force) return state.runtimeConfig;

  try {
    const response = await fetchRuntimeConfig();

    const config = await response.json();
    state.runtimeConfig = mergeConfig(DEFAULT_RUNTIME_CONFIG, config);
  } catch (error) {
    console.warn('Using fallback runtime config:', error);
    state.runtimeConfig = DEFAULT_RUNTIME_CONFIG;
  }

  if (DEBUG_MODE) console.table(flattenRuntimeConfig(state.runtimeConfig));

  return state.runtimeConfig;
}

async function fetchRuntimeConfig() {
  const preferredResponse = await fetch(`${API_BASE_URL}/config.json`, {
    cache: 'no-store'
  });
  if (preferredResponse.ok) return preferredResponse;

  const legacyResponse = await fetch(`${API_BASE_URL}/auth/config`, {
    cache: 'no-store'
  });
  if (!legacyResponse.ok) throw new Error(`Runtime config returned ${legacyResponse.status}`);

  return legacyResponse;
}

export function getRuntimeConfig() {
  return state.runtimeConfig || DEFAULT_RUNTIME_CONFIG;
}

export function getAuthConfig() {
  return getRuntimeConfig().auth;
}

export function getAuthMode() {
  return getAuthConfig().mode;
}

export function hasEmailConfig() {
  return getAuthConfig().hasEmail === true;
}

export function isOAuthEnabled() {
  return getAuthConfig().oauthEnabled === true;
}

export function isPasswordRegistrationEnabled() {
  return getAuthConfig().registrationEnabled === true;
}

function flattenRuntimeConfig(config) {
  return [
    { flag: 'auth.mode', setting: config.auth.mode },
    { flag: 'auth.hasEmail', setting: config.auth.hasEmail },
    { flag: 'auth.isInviteRequired', setting: config.auth.isInviteRequired },
    { flag: 'auth.oauthEnabled', setting: config.auth.oauthEnabled },
    { flag: 'auth.passwordResetEnabled', setting: config.auth.passwordResetEnabled },
    { flag: 'auth.registrationEnabled', setting: config.auth.registrationEnabled }
  ];
}
