/**
 * @description Gets `email`, `token`, and `reset` URL params if they exist.
 * The reset flag is detected either from a `?reset=true` query param
 * or from a `/reset` path segment (used by the password reset email link).
 */
export function getUrlParams() {
  const urlParams = new URLSearchParams(window.location.search);

  const emailParam = urlParams.get('email');
  const tokenParam = urlParams.get('token');
  const resetParam =
    urlParams.get('reset') === 'true' || window.location.pathname === '/reset';

  return {
    emailParam,
    tokenParam,
    resetParam
  };
}
