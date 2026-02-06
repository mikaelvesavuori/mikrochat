import { state } from './state.mjs';
import {
  serverName,
  serverNameInput,
  serverSettingsModal,
  serverNameText
} from './dom.mjs';
import { apiRequest } from './api.mjs';
import { showToast, showLoading, hideLoading } from './ui.mjs';
import { loadUsers } from './users.mjs';

/**
 * @description Open the server settings modal.
 */
export function openServerSettingsModal() {
  const updatedServerName = serverName.textContent.trim().replace(/\s+/g, ' ');
  serverNameInput.value = updatedServerName;
  serverSettingsModal.classList.add('active');
  serverNameInput.focus();
  loadUsers();

  const webhooksSection = document.getElementById('webhooks-section');
  if (state.currentUser?.isAdmin) {
    if (webhooksSection) webhooksSection.style.display = 'block';
    import('./webhooks.mjs').then(({ loadWebhooks }) => loadWebhooks());
  } else {
    if (webhooksSection) webhooksSection.style.display = 'none';
  }
}

/**
 * @description Hide the server settings modal.
 */
export function hideServerSettingsModal() {
  serverSettingsModal.classList.remove('active');
}

/**
 * @description Update the server name.
 */
export async function updateServerName(name) {
  try {
    showLoading();

    const response = await apiRequest('/server/settings', 'PUT', { name });

    serverNameText.textContent = name;

    await state.storage.setItem('serverName', name);

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
export async function loadServerName() {
  try {
    const response = await apiRequest('/server/settings', 'GET');
    if (response?.name) {
      serverNameText.textContent = response.name;
      await state.storage.setItem('serverName', response.name);
      return;
    }
  } catch (error) {
    console.error('Error loading server name from API:', error);
  }

  const savedName = await state.storage.getItem('serverName');
  if (savedName) serverNameText.textContent = savedName;
}
