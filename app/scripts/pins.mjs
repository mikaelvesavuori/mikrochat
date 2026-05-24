import { state } from './state.mjs';
import { pinsList, pinsModal } from './dom.mjs';
import { apiRequest } from './api.mjs';
import { showToast } from './ui.mjs';
import { formatMessageTime } from './messages.mjs';

export async function openPinsModal() {
  if (!pinsModal || !pinsList) return;

  if (state.viewMode !== 'channel' || !state.currentChannelId) {
    showToast('Pins are available in channels', 'info');
    return;
  }

  pinsModal.classList.add('active');
  pinsList.innerHTML = '<div class="empty-list">Loading...</div>';

  try {
    const response = await apiRequest(`/channels/${state.currentChannelId}/pins`);
    renderPins(response.messages || []);
  } catch (error) {
    showToast(error.message || 'Failed to load pins', 'error');
  }
}

function renderPins(messages) {
  pinsList.innerHTML = '';

  if (messages.length === 0) {
    pinsList.innerHTML = '<div class="empty-list">No pinned messages</div>';
    return;
  }

  for (const message of messages) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'pin-result';
    item.innerHTML = `
      <span class="pin-result-meta">${message.author?.userName || 'Someone'} · ${formatMessageTime(message.createdAt)}</span>
      <span class="pin-result-text"></span>
    `;
    item.querySelector('.pin-result-text').textContent =
      message.content || message.attachments?.[0]?.originalName || 'Attachment';

    item.addEventListener('click', () => {
      pinsModal.classList.remove('active');
      document.getElementById(`message-${message.id}`)?.scrollIntoView({
        block: 'center'
      });
    });

    pinsList.appendChild(item);
  }
}
