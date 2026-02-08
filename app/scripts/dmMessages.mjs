/**
 * @description Direct Message related functionality.
 */
import { state } from './state.mjs';
import { messagesArea, messageInput } from './dom.mjs';
import { showToast, scrollToBottom } from './ui.mjs';
import { apiRequest } from './api.mjs';
import { formatMessageContent, formatMessageTime } from './messages.mjs';
import { getInitials } from './utils.mjs';

const DM_PAGE_LIMIT = 50;
let isLoadingMoreDMs = false;

/**
 * @description Load messages for a conversation with pagination.
 */
export async function loadDMMessagesForConversation(conversationId, before) {
  if (!messagesArea) return;

  try {
    let url = `/conversations/${conversationId}/messages?limit=${DM_PAGE_LIMIT}`;
    if (before) url += `&before=${before}`;

    const response = await apiRequest(url);
    const messages = response.messages || [];

    if (!before) {
      state.dmMessageCache.set(conversationId, messages);
      renderDMMessages(messages);
    } else {
      // Prepend older messages to cache
      const cached = state.dmMessageCache.get(conversationId) || [];
      state.dmMessageCache.set(conversationId, [...messages, ...cached]);
      prependDMMessages(messages);
    }

    // Show load more if full page
    if (messages.length >= DM_PAGE_LIMIT) {
      showDMLoadMoreButton(conversationId, messages[0].id);
    } else {
      removeDMLoadMoreButton();
    }
  } catch (error) {
    console.error('Failed to load DM messages:', error);
    if (!before) {
      messagesArea.innerHTML =
        '<div class="empty-state"><div class="empty-state-icon">!</div><h3>Failed to load messages</h3></div>';
    }
  }
}

function prependDMMessages(messages) {
  if (!messagesArea || messages.length === 0) return;
  removeDMLoadMoreButton();
  const messagesByDate = groupMessagesByDate(messages);

  const sortedDates = Object.keys(messagesByDate).sort((a, b) => {
    const aTime = messagesByDate[a][0].createdAt;
    const bTime = messagesByDate[b][0].createdAt;
    return aTime - bTime;
  });

  for (const date of sortedDates) {
    const dayMessages = messagesByDate[date];

    const existingDivider = Array.from(
      messagesArea.querySelectorAll('.message-date-divider')
    ).find((div) => div.textContent === date);

    if (!existingDivider) {
      const dateDivider = document.createElement('div');
      dateDivider.className = 'message-date-divider';
      dateDivider.textContent = date;
      messagesArea.appendChild(dateDivider);
    }

    for (const message of dayMessages) {
      const el = createDMMessageElement(message);
      messagesArea.appendChild(el);
    }
  }
}

function showDMLoadMoreButton(conversationId, oldestId) {
  removeDMLoadMoreButton();
  const btn = document.createElement('button');
  btn.className = 'load-more-btn';
  btn.id = 'load-more-dm-messages';
  btn.textContent = 'Load older messages';
  btn.addEventListener('click', async () => {
    if (isLoadingMoreDMs) return;
    isLoadingMoreDMs = true;
    btn.textContent = 'Loading...';
    await loadDMMessagesForConversation(conversationId, oldestId);
    isLoadingMoreDMs = false;
  });
  messagesArea.appendChild(btn);
}

function removeDMLoadMoreButton() {
  const existing = document.getElementById('load-more-dm-messages');
  if (existing) existing.remove();
}

/**
 * @description Create a DOM element from a DM message.
 */
function createDMMessageElement(message) {
  const temp = document.createElement('div');
  temp.innerHTML = renderDMMessage(message);
  return temp.firstElementChild;
}

/**
 * @description Render DM messages in the messages area.
 * Uses the same prepend pattern as channel messages for correct
 * ordering with flex-direction: column-reverse.
 */
export function renderDMMessages(messages) {
  if (!messagesArea) return;

  if (messages.length === 0) {
    messagesArea.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">@</div>
        <h3>Start the conversation</h3>
        <p>Send a message to start chatting</p>
      </div>
    `;
    return;
  }

  messagesArea.innerHTML = '';

  const messagesByDate = groupMessagesByDate(messages);

  const sortedDates = Object.keys(messagesByDate).sort((a, b) => {
    const aTime = messagesByDate[a][0].createdAt;
    const bTime = messagesByDate[b][0].createdAt;
    return bTime - aTime;
  });

  for (const date of sortedDates) {
    const dateDivider = document.createElement('div');
    dateDivider.className = 'message-date-divider';
    dateDivider.textContent = date;
    messagesArea.appendChild(dateDivider);

    const dayMessages = messagesByDate[date];
    for (const message of dayMessages) {
      const el = createDMMessageElement(message);
      messagesArea.prepend(el);
    }
  }

  scrollToBottom();
}

/**
 * @description Group messages by date.
 */
function groupMessagesByDate(messages) {
  const groups = {};

  for (const message of messages) {
    const date = new Date(message.createdAt);
    const dateKey = formatDateKey(date);

    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(message);
  }

  return groups;
}

/**
 * @description Format date for grouping.
 */
function formatDateKey(date) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  } else {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });
  }
}

/**
 * @description Render a single DM message.
 */
export function renderDMMessage(message) {
  const isOwnMessage = message.author.id === state.currentUser?.id;
  const initials = getInitials(message.author.userName);
  const time = formatMessageTime(message.createdAt);
  const content = formatMessageContent(message.content);

  // Render images if present
  let imagesHtml = '';
  if (message.images && message.images.length > 0) {
    imagesHtml = '<div class="message-images-container">';
    for (const img of message.images) {
      imagesHtml += `
        <div class="message-image-container">
          <div class="image-wrapper">
            ${isOwnMessage ? `<span class="remove-image-btn" data-message-id="${message.id}" data-image="${img}">&times;</span>` : ''}
            <img src="/conversations/${state.currentConversationId}/messages/image/${img}?size=thumb" alt="Image" class="message-image" loading="lazy" data-image="${img}">
          </div>
        </div>
      `;
    }
    imagesHtml += '</div>';
  }

  // Render reactions
  const reactionsHtml = renderDMReactions(message);

  // Actions (edit/delete for own messages)
  let actionsHtml = '';
  if (isOwnMessage) {
    actionsHtml = `
      <div class="message-actions">
        <button class="message-edit" data-message-id="${message.id}" data-is-dm="true">Edit</button>
        <button class="message-delete" data-message-id="${message.id}" data-is-dm="true">Delete</button>
      </div>
    `;
  }

  return `
    <div class="message" data-id="${message.id}" data-is-dm="true">
      <div class="message-avatar">${initials}</div>
      <div class="message-content">
        <div class="message-header">
          <span class="message-author">${message.author.userName}</span>
          <span class="message-time">${time}</span>
        </div>
        <div class="message-text">${content}</div>
        ${imagesHtml}
        ${reactionsHtml}
        ${actionsHtml}
      </div>
    </div>
  `;
}

/**
 * @description Render reactions for a DM message.
 */
function renderDMReactions(message) {
  if (!message.reactions || Object.keys(message.reactions).length === 0) {
    return `
      <div class="message-reactions">
        <div class="add-reaction" data-message-id="${message.id}">+</div>
      </div>
    `;
  }

  // Group reactions by emoji
  const reactionCounts = {};
  const userReactionMap = {};

  for (const [userId, emojis] of Object.entries(message.reactions)) {
    for (const emoji of emojis) {
      if (!reactionCounts[emoji]) {
        reactionCounts[emoji] = 0;
        userReactionMap[emoji] = [];
      }
      reactionCounts[emoji]++;
      userReactionMap[emoji].push(userId);
    }
  }

  let html = '<div class="message-reactions">';

  for (const [emoji, count] of Object.entries(reactionCounts)) {
    const hasUserReacted = userReactionMap[emoji].includes(
      state.currentUser?.id
    );
    html += `
      <div class="reaction ${hasUserReacted ? 'user-reacted' : ''}"
           data-message-id="${message.id}"
           data-reaction="${emoji}">
        <span class="reaction-emoji">${emoji}</span>
        <span class="reaction-count">${count}</span>
      </div>
    `;
  }

  html += `<div class="add-reaction" data-message-id="${message.id}">+</div>`;
  html += '</div>';

  return html;
}

/**
 * @description Send a DM message.
 */
export async function sendDMMessage(content, images = []) {
  if (!state.currentConversationId) return;

  try {
    const response = await apiRequest(
      `/conversations/${state.currentConversationId}/messages`,
      'POST',
      { content, images }
    );

    // Clear input
    if (messageInput) {
      messageInput.value = '';
      messageInput.style.height = 'auto';
    }

    // Clear pending uploads
    state.pendingUploads = [];
    const pendingContainer = document.getElementById(
      'pending-uploads-container'
    );
    const pendingUploads = document.getElementById('pending-uploads');
    if (pendingContainer) pendingContainer.style.display = 'none';
    if (pendingUploads) pendingUploads.innerHTML = '';

    return response.message;
  } catch (error) {
    console.error('Failed to send DM:', error);
    showToast(error.message || 'Failed to send message', 'error');
    throw error;
  }
}

/**
 * @description Upload an image for a DM.
 * @param {Object} fileData - Object with name and blob properties
 */
export async function uploadDMImage(fileData) {
  if (!state.currentConversationId) return null;

  try {
    const base64 = await blobToBase64(fileData.blob);
    const payload = {
      filename: fileData.name,
      image: base64
    };

    if (fileData.thumbnailBlob) {
      payload.thumbnail = await blobToBase64(fileData.thumbnailBlob);
    }

    const response = await apiRequest(
      `/conversations/${state.currentConversationId}/messages/image`,
      'POST',
      payload
    );

    return response.filename;
  } catch (error) {
    console.error('Failed to upload DM image:', error);
    showToast('Failed to upload image', 'error');
    return null;
  }
}

/**
 * @description Convert blob to base64.
 */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * @description Delete a DM message.
 */
export async function deleteDMMessage(messageId) {
  if (!state.currentConversationId) return;

  try {
    await apiRequest(
      `/conversations/${state.currentConversationId}/messages/${messageId}`,
      'DELETE'
    );
    showToast('Message deleted', 'success');
  } catch (error) {
    console.error('Failed to delete DM:', error);
    showToast(error.message || 'Failed to delete message', 'error');
  }
}

/**
 * @description Update a DM message.
 */
export async function updateDMMessage(messageId, content, images) {
  if (!state.currentConversationId) return;

  try {
    const response = await apiRequest(
      `/conversations/${state.currentConversationId}/messages/${messageId}`,
      'PUT',
      { content, images }
    );
    showToast('Message updated', 'success');
    return response.message;
  } catch (error) {
    console.error('Failed to update DM:', error);
    showToast(error.message || 'Failed to update message', 'error');
    throw error;
  }
}

/**
 * @description Append a new DM message to the view (from SSE).
 */
export function appendDMMessage(message) {
  if (
    !messagesArea ||
    state.viewMode !== 'dm' ||
    state.currentConversationId !== message.channelId
  ) {
    return;
  }

  // Check if this message already exists
  const existingEl = messagesArea.querySelector(
    `.message[data-id="${message.id}"]`
  );
  if (existingEl) return;

  // Add to cache
  const cachedMessages = state.dmMessageCache.get(message.channelId) || [];
  cachedMessages.push(message);
  state.dmMessageCache.set(message.channelId, cachedMessages);

  // Check for empty state and replace it
  const emptyState = messagesArea.querySelector('.empty-state');
  if (emptyState) {
    messagesArea.innerHTML = '';
  }

  // Check if we need to add a date divider (first in DOM = newest with column-reverse)
  const today = formatDateKey(new Date());
  const newestDivider = messagesArea.querySelector('.message-date-divider');
  if (!newestDivider || newestDivider.textContent !== today) {
    const divider = document.createElement('div');
    divider.className = 'message-date-divider';
    divider.textContent = today;
    messagesArea.insertBefore(divider, messagesArea.firstChild);
  }

  // Insert message at the visual bottom (first child due to column-reverse)
  const messageEl = createDMMessageElement(message);
  messagesArea.insertBefore(messageEl, messagesArea.firstChild);

  scrollToBottom();
}

/**
 * @description Update a DM message in the view (from SSE).
 */
export function updateDMMessageInView(message) {
  if (
    !messagesArea ||
    state.viewMode !== 'dm' ||
    state.currentConversationId !== message.channelId
  ) {
    return;
  }

  const existingEl = messagesArea.querySelector(
    `.message[data-id="${message.id}"]`
  );
  if (!existingEl) return;

  // Update cache
  const cachedMessages = state.dmMessageCache.get(message.channelId) || [];
  const index = cachedMessages.findIndex((m) => m.id === message.id);
  if (index !== -1) {
    cachedMessages[index] = message;
    state.dmMessageCache.set(message.channelId, cachedMessages);
  }

  // Replace message element
  existingEl.replaceWith(createDMMessageElement(message));
}

/**
 * @description Remove a DM message from the view (from SSE).
 */
export function removeDMMessageFromView(messageId, conversationId) {
  if (
    !messagesArea ||
    state.viewMode !== 'dm' ||
    state.currentConversationId !== conversationId
  ) {
    return;
  }

  const existingEl = messagesArea.querySelector(
    `.message[data-id="${messageId}"]`
  );
  if (existingEl) {
    existingEl.remove();
  }

  // Update cache
  const cachedMessages = state.dmMessageCache.get(conversationId) || [];
  const filtered = cachedMessages.filter((m) => m.id !== messageId);
  state.dmMessageCache.set(conversationId, filtered);

  // Show empty state if no messages left
  if (filtered.length === 0) {
    messagesArea.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">@</div>
        <h3>Start the conversation</h3>
        <p>Send a message to start chatting</p>
      </div>
    `;
  }
}
