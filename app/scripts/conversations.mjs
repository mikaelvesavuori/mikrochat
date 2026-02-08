/**
 * @description Conversation (Direct Messages) related functionality.
 */
import { state } from './state.mjs';
import {
  dmList,
  startDmModal,
  dmUserList,
  currentChannelName
} from './dom.mjs';
import { showToast, updateDocumentTitle } from './ui.mjs';
import { loadDMMessagesForConversation } from './dmMessages.mjs';
import { apiRequest } from './api.mjs';

/**
 * @description Load all conversations for the current user.
 */
export async function loadConversations() {
  try {
    const response = await apiRequest('/conversations');
    const conversations = response.conversations || [];

    state.conversationCache.clear();
    for (const conv of conversations) {
      state.conversationCache.set(conv.id, conv);
    }

    renderConversationsList(conversations);
  } catch (error) {
    console.error('Failed to load conversations:', error);
  }
}

/**
 * @description Render the conversations list in the sidebar.
 */
export function renderConversationsList(conversations) {
  if (!dmList) return;

  dmList.innerHTML = '';

  if (conversations.length === 0) {
    dmList.innerHTML = '<div class="empty-list">No conversations yet</div>';
    return;
  }

  for (const conv of conversations) {
    const dmItem = renderConversationItem(conv);
    dmList.appendChild(dmItem);
  }
}

/**
 * @description Render a single conversation item.
 */
export function renderConversationItem(conversation) {
  const item = document.createElement('div');
  item.className = 'dm-item';
  item.dataset.conversationId = conversation.id;

  if (state.currentConversationId === conversation.id) {
    item.classList.add('active');
  }

  const otherUser = conversation.otherUser;
  const userName = otherUser?.userName || 'Unknown User';
  const initial = userName.charAt(0).toUpperCase();

  item.innerHTML = `
    <div class="dm-avatar">${initial}</div>
    <span class="dm-name">${userName}</span>
    ${getUnreadBadge(conversation.id)}
  `;

  item.addEventListener('click', () => selectConversation(conversation.id));

  return item;
}

/**
 * @description Get unread badge HTML if there are unread messages.
 */
function getUnreadBadge(conversationId) {
  const count = state.dmUnreadCounts.get(conversationId) || 0;
  if (count > 0) {
    return `<div class="notification-badge">${count > 99 ? '99+' : count}</div>`;
  }
  return '';
}

/**
 * @description Select a conversation and load its messages.
 */
export async function selectConversation(conversationId) {
  // Clear channel selection
  state.currentChannelId = null;
  state.viewMode = 'dm';

  // Update active states
  document.querySelectorAll('.channel-item').forEach((el) => {
    el.classList.remove('active');
  });
  document.querySelectorAll('.dm-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.conversationId === conversationId);
  });

  state.currentConversationId = conversationId;

  // Clear unread count for this conversation and re-render badge
  state.dmUnreadCounts.set(conversationId, 0);
  updateDocumentTitle();

  // Re-render the DM item to remove the notification badge
  const dmItem = document.querySelector(
    `.dm-item[data-conversation-id="${conversationId}"]`
  );
  if (dmItem) {
    const badge = dmItem.querySelector('.notification-badge');
    if (badge) badge.remove();
  }

  // Update header
  const conversation = state.conversationCache.get(conversationId);
  if (conversation && currentChannelName) {
    const userName = conversation.otherUser?.userName || 'Direct Message';
    currentChannelName.textContent = userName;
    // Remove the # prefix for DMs
    currentChannelName.style.setProperty('--channel-prefix', '"@"');
  }

  // Load messages
  await loadDMMessagesForConversation(conversationId);

  // Close mobile sidebar if open
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.classList.remove('open');
}

/**
 * @description Start a new conversation with a user.
 */
export async function startConversation(targetUserId) {
  try {
    const response = await apiRequest('/conversations', 'POST', {
      targetUserId
    });
    const { conversation, isNew } = response;

    // Add to cache
    state.conversationCache.set(conversation.id, conversation);

    // Refresh list and select the conversation
    await loadConversations();
    await selectConversation(conversation.id);

    // Close modal
    closeStartDmModalFn();

    if (isNew) {
      showToast('Conversation started', 'success');
    }
  } catch (error) {
    console.error('Failed to start conversation:', error);
    showToast(error.message || 'Failed to start conversation', 'error');
  }
}

// Cache for DM user search
let dmUserSearchCache = [];

/**
 * @description Open the Start DM modal.
 */
export async function openStartDmModal() {
  if (!startDmModal || !dmUserList) return;

  startDmModal.classList.add('active');

  const searchInput = document.getElementById('dm-user-search');
  if (searchInput) {
    searchInput.value = '';
    searchInput.focus();
  }

  // Load users
  try {
    const response = await apiRequest('/users');
    const users = response.users || [];

    // Filter out current user
    const otherUsers = users.filter((u) => u.id !== state.currentUser?.id);
    dmUserSearchCache = otherUsers;

    renderDmUserSelectList(otherUsers);

    // Set up search filtering
    if (searchInput) {
      // Remove old listener by replacing element
      const newSearchInput = searchInput.cloneNode(true);
      searchInput.parentNode.replaceChild(newSearchInput, searchInput);
      newSearchInput.focus();

      newSearchInput.addEventListener('input', () => {
        const query = newSearchInput.value.trim().toLowerCase();
        if (!query) {
          renderDmUserSelectList(dmUserSearchCache);
          return;
        }
        const filtered = dmUserSearchCache.filter(
          (u) =>
            (u.userName || '').toLowerCase().includes(query) ||
            (u.email || '').toLowerCase().includes(query)
        );
        renderDmUserSelectList(filtered);
      });
    }
  } catch (error) {
    console.error('Failed to load users:', error);
    dmUserList.innerHTML = '<div class="empty-list">Failed to load users</div>';
  }
}

/**
 * @description Close the Start DM modal.
 */
export function closeStartDmModalFn() {
  if (!startDmModal) return;
  startDmModal.classList.remove('active');
}

/**
 * @description Render the user select list in the Start DM modal.
 */
function renderDmUserSelectList(users) {
  if (!dmUserList) return;

  dmUserList.innerHTML = '';

  if (users.length === 0) {
    dmUserList.innerHTML =
      '<div class="empty-list">No other users available</div>';
    return;
  }

  for (const user of users) {
    const item = document.createElement('div');
    item.className = 'dm-user-item';

    const initial =
      user.userName?.charAt(0).toUpperCase() ||
      user.email.charAt(0).toUpperCase();

    item.innerHTML = `
      <div class="user-avatar">${initial}</div>
      <div class="user-info">
        <div class="user-name">${user.userName || user.email.split('@')[0]}</div>
        <div class="user-email">${user.email}</div>
      </div>
    `;

    item.addEventListener('click', () => startConversation(user.id));

    dmUserList.appendChild(item);
  }
}

/**
 * @description Update a conversation in the cache and re-render.
 */
export function updateConversationInCache(conversation) {
  state.conversationCache.set(conversation.id, conversation);
  const conversations = Array.from(state.conversationCache.values());
  // Sort by lastMessageAt
  conversations.sort(
    (a, b) =>
      (b.lastMessageAt || b.createdAt) - (a.lastMessageAt || a.createdAt)
  );
  renderConversationsList(conversations);
}

/**
 * @description Increment unread count for a conversation.
 */
export function incrementDmUnread(conversationId) {
  if (state.currentConversationId === conversationId) return;

  const current = state.dmUnreadCounts.get(conversationId) || 0;
  state.dmUnreadCounts.set(conversationId, current + 1);

  // Re-render to show badge
  const conversations = Array.from(state.conversationCache.values());
  renderConversationsList(conversations);
}
