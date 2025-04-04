exitServerButton.addEventListener('click', async () => {
  if (
    confirm(
      'Are you sure you want to exit this server? This action cannot be undone.'
    )
  ) {
    try {
      showLoading();
      const response = await apiRequest('/users/exit', 'POST');
      hideLoading();

      if (response.success) {
        await storage.clear();
        showToast('You have exited the server. Goodbye!');
        return await showAuthScreen();
      }
    } catch (error) {
      hideLoading();
      showToast(error.message || 'Failed to exit server', 'error');
    }
  }
});
