logoutButton.addEventListener('click', async () => {
  try {
    showLoading();

    await signout();

    showToast('Logged out successfully');
    return await showAuthScreen();
  } catch (error) {
    hideLoading();
    showToast(error.message || 'Failed to logout', 'error');
  }
});
