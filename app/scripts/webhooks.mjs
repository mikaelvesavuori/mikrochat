import { apiRequest } from './api.mjs';
import { showToast, showLoading, hideLoading } from './ui.mjs';

/**
 * @description Load and display all webhooks in the settings panel.
 */
export async function loadWebhooks() {
  const webhooksList = document.getElementById('webhooks-list');
  const webhookChannelSelect = document.getElementById(
    'webhook-channel-select'
  );
  if (!webhooksList || !webhookChannelSelect) return;

  try {
    const response = await apiRequest('/webhooks', 'GET');
    webhooksList.innerHTML = '';

    const channelsResponse = await apiRequest('/channels', 'GET');
    webhookChannelSelect.innerHTML = '';
    for (const channel of channelsResponse.channels || []) {
      const option = document.createElement('option');
      option.value = channel.id;
      option.textContent = channel.name;
      webhookChannelSelect.appendChild(option);
    }

    if (response.webhooks && response.webhooks.length > 0) {
      for (const webhook of response.webhooks) {
        const channel = (channelsResponse.channels || []).find(
          (c) => c.id === webhook.channelId
        );
        const channelName = channel ? channel.name : 'Unknown';

        const webhookItem = document.createElement('div');
        webhookItem.className = 'webhook-item';
        webhookItem.dataset.id = webhook.id;
        webhookItem.innerHTML = `
          <div class="webhook-info">
            <div class="webhook-name">${webhook.name}</div>
            <div class="webhook-channel">Channel: #${channelName}</div>
          </div>
          <div class="webhook-actions">
            <button class="remove-webhook" title="Delete Webhook">&#10005;</button>
          </div>
        `;

        const removeButton = webhookItem.querySelector('.remove-webhook');
        if (removeButton) {
          removeButton.addEventListener('click', () =>
            deleteWebhook(webhook.id, webhook.name)
          );
        }

        webhooksList.appendChild(webhookItem);
      }
    } else {
      webhooksList.innerHTML =
        '<div class="empty-list">No webhooks created yet</div>';
    }
  } catch (_error) {
    // Non-admins will get an error - silently ignore
  }
}

/**
 * @description Create a new webhook.
 */
export async function createWebhook(name, channelId) {
  const webhooksList = document.getElementById('webhooks-list');
  const webhookNameInput = document.getElementById('webhook-name-input');

  try {
    showLoading();
    const response = await apiRequest('/webhooks', 'POST', { name, channelId });
    hideLoading();

    if (response.webhook) {
      showToast('Webhook created successfully!');

      const tokenDisplay = document.createElement('div');
      tokenDisplay.className = 'webhook-token-display';
      tokenDisplay.innerHTML = `
        <div class="webhook-token-label">Webhook Token (copy now, shown only once):</div>
        <code class="webhook-token-value">${response.webhook.token}</code>
        <button class="btn webhook-token-copy">Copy</button>
      `;
      if (webhooksList) webhooksList.prepend(tokenDisplay);

      const copyButton = tokenDisplay.querySelector('.webhook-token-copy');
      if (copyButton) {
        copyButton.addEventListener('click', () => {
          navigator.clipboard.writeText(response.webhook.token);
          showToast('Token copied to clipboard');
        });
      }

      if (webhookNameInput) webhookNameInput.value = '';
      await loadWebhooks();
    }
  } catch (error) {
    hideLoading();
    showToast(error.message || 'Failed to create webhook', 'error');
  }
}

/**
 * @description Delete a webhook.
 */
export async function deleteWebhook(webhookId, name) {
  if (confirm(`Are you sure you want to delete webhook "${name}"?`)) {
    try {
      showLoading();
      await apiRequest(`/webhooks/${webhookId}`, 'DELETE');
      hideLoading();

      showToast(`Webhook "${name}" has been deleted`);
      await loadWebhooks();
    } catch (error) {
      hideLoading();
      showToast(error.message || 'Failed to delete webhook', 'error');
    }
  }
}
