/**
 * @description Gets `email`, `token`, and `reset` URL params if they exist.
 */
export function getUrlParams() {
  const urlParams = new URLSearchParams(window.location.search);

  const emailParam = urlParams.get('email');
  const tokenParam = urlParams.get('token');
  const resetParam = urlParams.get('reset') === 'true';

  return {
    emailParam,
    tokenParam,
    resetParam
  };
}
