/**
 * @description Open the server settings modal.
 */
function openServerSettingsModal() {
  const updatedServerName = serverName.textContent.trim().replace(/\s+/g, ' ');
  serverNameInput.value = updatedServerName;
  serverSettingsModal.classList.add('active');
  serverNameInput.focus();
  loadUsers();
}

/**
 * @description Hide the server settings modal.
 */
function hideServerSettingsModal() {
  serverSettingsModal.classList.remove('active');
}

/**
 * @description Update the server name.
 */
async function updateServerName(name) {
  try {
    showLoading();

    const response = await apiRequest('/server/settings', 'PUT', { name });

    serverNameText.textContent = name;

    await storage.setItem('serverName', name);

    hideServerSettingsModal();
    showToast('Server name updated successfully');

    hideLoading();
    return response;
  } catch (error) {
    hideLoading();
    showToast(error.message || 'Failed to update server name', 'error');
    throw error;
  }
}

/**
 * @description Get the server name.
 */
async function loadServerName() {
  try {
    const response = await apiRequest('/server/settings', 'GET');
    if (response?.name) {
      serverNameText.textContent = response.name;
      await storage.setItem('serverName', response.name);
      return;
    }
  } catch (error) {
    console.error('Error loading server name from API:', error);
  }

  const savedName = await storage.getItem('serverName');
  if (savedName) serverNameText.textContent = savedName;
}
