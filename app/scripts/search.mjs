import { state } from './state.mjs';
import { searchInput, searchModal, searchResults } from './dom.mjs';
import { apiRequest } from './api.mjs';
import { showToast } from './ui.mjs';
import { selectChannel } from './channels.mjs';
import { selectConversation } from './conversations.mjs';
import { formatMessageTime } from './messages.mjs';

let searchTimer = null;

export function openSearchModal() {
  if (!searchModal || !searchInput) return;

  searchModal.classList.add('active');
  searchInput.value = '';
  if (searchResults) searchResults.innerHTML = '';
  searchInput.focus();
}

export function runSearch(query) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => searchMessages(query), 180);
}

async function searchMessages(query) {
  const trimmed = query.trim();
  if (!searchResults) return;

  if (trimmed.length < 2) {
    searchResults.innerHTML = '';
    return;
  }

  try {
    const params = new URLSearchParams({ q: trimmed, limit: '30' });
    if (state.viewMode === 'channel' && state.currentChannelId)
      params.set('channelId', state.currentChannelId);
    if (state.viewMode === 'dm' && state.currentConversationId)
      params.set('conversationId', state.currentConversationId);

    const response = await apiRequest(`/search/messages?${params}`);
    renderSearchResults(response.messages || []);
  } catch (error) {
    showToast(error.message || 'Search failed', 'error');
  }
}

function renderSearchResults(messages) {
  searchResults.innerHTML = '';

  if (messages.length === 0) {
    searchResults.innerHTML = '<div class="empty-list">No matches</div>';
    return;
  }

  for (const message of messages) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'search-result';
    item.dataset.messageId = message.id;
    item.dataset.channelId = message.channelId;

    const location = message.channelId.startsWith('dm:')
      ? 'Direct message'
      : `#${state.channelCache.get(message.channelId)?.name || 'channel'}`;

    item.innerHTML = `
      <span class="search-result-meta">${location} · ${message.author?.userName || 'Someone'} · ${formatMessageTime(message.createdAt)}</span>
      <span class="search-result-text"></span>
    `;
    item.querySelector('.search-result-text').textContent =
      message.content || message.attachments?.[0]?.originalName || 'Attachment';

    item.addEventListener('click', async () => {
      if (message.channelId.startsWith('dm:')) {
        await selectConversation(message.channelId);
      } else {
        const channel = state.channelCache.get(message.channelId);
        await selectChannel(message.channelId, channel?.name || 'Channel');
      }

      searchModal.classList.remove('active');
      setTimeout(() => {
        document.getElementById(`message-${message.id}`)?.scrollIntoView({
          block: 'center'
        });
      }, 100);
    });

    searchResults.appendChild(item);
  }
}
