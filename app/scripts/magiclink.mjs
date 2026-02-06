import { state } from './state.mjs';
import { getUrlParams } from './url.mjs';
import { verifyToken } from './auth.mjs';

/**
 * @description Checks if the current URL looks to be a magic link URL,
 * carrying the token and email parameters it should have.
 */
export function isMagicLinkUrl() {
  const { emailParam, tokenParam } = getUrlParams();
  return emailParam && tokenParam;
}

/**
 * @description Checks if the magic link is valid and sets the
 * tokens in localStorage if it is valid.
 */
export async function verifyMagicLink() {
  try {
    const { emailParam, tokenParam } = getUrlParams();
    if (!emailParam || !tokenParam) return false;
    const response = await verifyToken({
      email: emailParam,
      token: tokenParam
    });

    const { accessToken, refreshToken } = response;

    await state.storage.setItem('accessToken', accessToken);
    await state.storage.setItem('refreshToken', refreshToken);

    return true;
  } catch (error) {
    console.log('Magic link verification error:', error);
    return false;
  }
}
