/**
 * @description Gets `email` and `token` URL params if they exist.
 */
function getUrlParams() {
  const urlParams = new URLSearchParams(window.location.search);

  const emailParam = urlParams.get('email');
  const tokenParam = urlParams.get('token');

  return {
    emailParam,
    tokenParam
  };
}
