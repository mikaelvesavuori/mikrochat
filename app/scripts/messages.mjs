import { state } from './state.mjs';
import { messageInput, messagesArea, channelsList } from './dom.mjs';
import { API_BASE_URL, MAX_CONTENT_LENGTH } from './config.mjs';
import { apiRequest, fetchImageWithAuth } from './api.mjs';
import {
  showToast,
  showLoading,
  hideLoading,
  updatePendingUploadsUI,
  openEditModal,
  openReactionPicker,
  renderReaction
} from './ui.mjs';
import { getAccessToken } from './auth.mjs';
import {
  sanitizeInput,
  formatDate,
  formatTime,
  getInitials,
  parseMarkdown
} from './utils.mjs';
import { convertBlobToBase64 } from './images.mjs';
import { processReactions } from './reactions.mjs';

/**
 * @description Sends a message to the API.
 *
 * If the message includes images, these will be uploaded separately,
 * and then their uploaded image filenames will be attached as updated
 * data on the wrapping message.
 */
export async function sendMessage(content) {
  const sanitizedContent = sanitizeInput(content);

  if (!sanitizedContent.trim() && state.pendingUploads.length === 0) return;

  if (sanitizedContent.length > MAX_CONTENT_LENGTH) {
    showToast(
      `Message too long. Your message is ${sanitizedContent.length} characters long and we support up to ${MAX_CONTENT_LENGTH} characters.`,
      'error'
    );
    return;
  }

  // Handle DM mode
  if (state.viewMode === 'dm' && state.currentConversationId) {
    const { sendDMMessage, uploadDMImage } = await import('./dmMessages.mjs');
    try {
      // Handle image uploads for DM
      const uploadedImages = [];
      if (state.pendingUploads.length > 0) {
        for (const upload of state.pendingUploads) {
          const filename = await uploadDMImage({
            name: upload.fileName,
            blob: upload.blob,
            thumbnailBlob: upload.thumbnailBlob
          });
          if (filename) uploadedImages.push(filename);
          URL.revokeObjectURL(upload.preview);
        }
      }

      await sendDMMessage(sanitizedContent, uploadedImages);
    } catch (error) {
      showToast(error.message || 'Failed to send message', 'error');
    }
    return;
  }

  try {
    messageInput.value = '';
    const tempId = `temp-${Date.now()}`;

    const emptyState = messagesArea.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    const data = { content: sanitizedContent };
    if (state.pendingUploads.length > 0) data.images = []; // Handle case where there are images but no text message

    const response = await apiRequest(
      `/channels/${state.currentChannelId}/messages`,
      'POST',
      data
    );

    if (!response.message?.id) throw new Error('Failed to create message');

    const messageId = response.message.id;

    state.tempIdMap.set(tempId, messageId);
    state.messageCache.delete(tempId);
    state.messageCache.set(messageId, {
      ...response.message,
      content: response.message.content
    });

    updateMessageIds(tempId, messageId);

    if (state.pendingUploads.length > 0) {
      await attachImagesToMessage(messageId);
      await renderImagesInMessage(messageId, state.pendingUploads);
    }
  } catch (error) {
    showToast(error.message || 'Failed to send message', 'error');
  }
}

/**
 * @description Uploads images that are attached to a message
 * and then updates the message with references to the images.
 */
export async function attachImagesToMessage(messageId) {
  try {
    showLoading();

    const token = await getAccessToken();
    const headers = { 'Content-Type': 'application/json' };

    if (token) headers.Authorization = `Bearer ${token}`;

    const images = [];
    const processedHashes = new Set();

    for (const upload of state.pendingUploads) {
      if (processedHashes.has(upload.fileHash)) {
        console.log(`Skipping duplicate image with hash: ${upload.fileHash}`);
        URL.revokeObjectURL(upload.preview);
        continue;
      }

      processedHashes.add(upload.fileHash);

      const image = await convertBlobToBase64(upload.blob);
      const thumbnail = upload.thumbnailBlob
        ? await convertBlobToBase64(upload.thumbnailBlob)
        : undefined;

      const payload = { filename: upload.fileName, image };
      if (thumbnail) payload.thumbnail = thumbnail;

      const response = await apiRequest(
        `/channels/${state.currentChannelId}/messages/image`,
        'POST',
        payload
      );

      const { filename } = response;
      images.push(filename);

      URL.revokeObjectURL(upload.preview);
    }

    if (images.length > 0) {
      await apiRequest(`/messages/${messageId}`, 'PUT', {
        images
      });

      if (state.messageCache.has(messageId)) {
        const cachedMessage = state.messageCache.get(messageId);
        cachedMessage.images = images;
        state.messageCache.set(messageId, cachedMessage);
      }
    }

    state.pendingUploads = [];
    updatePendingUploadsUI();

    hideLoading();

    if (images.length > 0) showToast('Images uploaded successfully');
  } catch (error) {
    hideLoading();
    showToast(error.message || 'Failed to upload images', 'error');
  }
}

/**
 * @description Appends a message to a channel, effecively meaning that users can see it.
 */
export async function appendMessage(message) {
  if (document.querySelector(`.message[data-id="${message.id}"]`)) return;

  if (!message.id.startsWith('temp-')) {
    const existingMessages = document.querySelectorAll('.message');

    for (const existingMsg of existingMessages) {
      const sameAuthor = existingMsg.dataset.authorId === message.author.id;

      const sameContent =
        existingMsg.querySelector('.message-text')?.textContent ===
        message.content;

      const isTemp = existingMsg.dataset.id.startsWith('temp-');

      if (sameAuthor && sameContent && isTemp) {
        console.log(
          `Found matching temp message, updating ID from ${existingMsg.dataset.id} to ${message.id}`
        );
        updateMessageIds(existingMsg.dataset.id, message.id);

        state.messageCache.delete(existingMsg.dataset.id);
        state.messageCache.set(message.id, message);
        state.tempIdMap.set(existingMsg.dataset.id, message.id);

        return;
      }
    }
  }

  state.messageCache.set(message.id, message);
  const messageDate = formatDate(
    new Date(message.timestamp || message.createdAt)
  );

  renderDateDividers(messageDate);

  const messageElement = document.createElement('div');
  messageElement.className = 'message';
  messageElement.dataset.id = message.id;
  messageElement.dataset.authorId = message.author.id;
  messageElement.dataset.date = messageDate;

  messageElement.innerHTML = createMessageContent(message);

  addMessageEventListeners(message, messageElement);

  messagesArea.prepend(messageElement);

  await renderReactionsForMessage(message);

  if (message.images && message.images.length > 0)
    await renderImagesInMessage(message.id, message.images);
}

/**
 * @description Render any images attached to a message.
 */
export async function renderImagesInMessage(messageId, images) {
  const messageElement = document.querySelector(
    `.message[data-id="${messageId}"]`
  );

  if (messageElement) {
    let imagesContainer = messageElement.querySelector(
      '.message-images-container'
    );

    if (!imagesContainer) {
      const messageContent = messageElement.querySelector('.message-content');
      imagesContainer = document.createElement('div');
      imagesContainer.className = 'message-images-container';

      const reactionsContainer =
        messageElement.querySelector('.message-reactions');
      messageContent.insertBefore(imagesContainer, reactionsContainer);
    }

    for (const image of images) {
      const imageUrl = `${API_BASE_URL}/channels/${state.currentChannelId}/messages/image/${image}`;
      const containerId = `img-container-${messageId}-${image}`;

      const imageContainer = document.createElement('div');
      imageContainer.id = containerId;
      imageContainer.className = 'message-image-container';
      imagesContainer.appendChild(imageContainer);
      await fetchImageWithAuth(imageUrl, containerId, messageId, image);
    }
  }
}

/**
 * @description Creates the markup for the message.
 */
export function createMessageContent(message) {
  let authorName = 'Unknown User';
  if (message.author?.userName) authorName = message.author.userName;
  else if (message.author.id === state.currentUser.id)
    authorName = state.currentUser.userName;

  const avatarInitials = getInitials(authorName);
  const timestamp = message.timestamp || message.createdAt;
  const time = formatTime(new Date(timestamp));

  let textContent = '';

  if (message.content) {
    let formattedContent = parseMarkdown(message.content);
    formattedContent = linkifyUrls(formattedContent);
    formattedContent = linkifyChannels(formattedContent);
    textContent = `<div class="message-text">${formattedContent}</div>`;
  }

  const threadBadgeHtml = message.threadMeta
    ? `<div class="thread-badge" data-thread-id="${message.id}">
        <span class="thread-badge-count">${message.threadMeta.replyCount} ${message.threadMeta.replyCount === 1 ? 'reply' : 'replies'}</span>
        <span class="thread-badge-last">Last reply by ${message.threadMeta.lastReplyBy?.userName || 'Someone'}</span>
      </div>`
    : '';

  return `
  <div class="message-avatar">${avatarInitials}</div>
  <div class="message-content">
    <div class="message-header">
      <span class="message-author">${authorName}</span>
      ${message.author?.isBot ? '<span class="bot-badge">BOT</span>' : ''}
      <span class="message-time">${time}</span>
    </div>
    ${textContent}
    <div class="message-images-container"></div>
    <div class="message-reactions"></div>
    ${threadBadgeHtml}
    <div class="message-actions">
      ${
        message.author.id === state.currentUser?.id
          ? `
        <button class="message-edit" data-id="${message.id}">Edit</button>
        <button class="message-delete" data-id="${message.id}">Delete</button>
      `
          : message.author?.isBot && state.currentUser?.isAdmin
            ? `<button class="message-delete" data-id="${message.id}">Delete</button>`
            : ''
      }
      <div class="add-reaction" data-id="${message.id}">+ Add Reaction</div>
      <div class="start-thread" data-id="${message.id}">Reply</div>
    </div>
  </div>
`;
}

/**
 * @description Render any reactions that exist on a message.
 */
export async function renderReactionsForMessage(message) {
  if (message.reactions && Object.keys(message.reactions).length > 0) {
    const reactionItems = processReactions(message.reactions);

    for (const [reaction, userIds] of Object.entries(reactionItems)) {
      const hasUserReacted = userIds.includes(state.currentUser.id);
      await renderReaction(
        message.id,
        reaction,
        userIds.length,
        hasUserReacted
      );
    }
  }
}

/**
 * @description Render date dividers correctly.
 */
export function renderDateDividers(messageDate) {
  let dateDividerExists = false;

  const dateDividers = document.querySelectorAll('.message-date-divider');

  for (const divider of dateDividers) {
    if (divider.textContent === messageDate) {
      dateDividerExists = true;
      break;
    }
  }

  if (!dateDividerExists) {
    const dateDivider = document.createElement('div');
    dateDivider.className = 'message-date-divider';
    dateDivider.textContent = messageDate;
    messagesArea.prepend(dateDivider);
  }
}

/**
 * @description Dynamically add all necessary message event listeners
 * to track user interactions.
 */
export function addMessageEventListeners(message, messageElement) {
  const editButton = messageElement.querySelector('.message-edit');
  if (editButton)
    editButton.addEventListener('click', () => openEditModal(message));

  const deleteButton = messageElement.querySelector('.message-delete');
  if (deleteButton)
    deleteButton.addEventListener('click', () => deleteMessage(message.id));

  const addReactionButton = messageElement.querySelector('.add-reaction');
  if (addReactionButton)
    addReactionButton.addEventListener('click', () =>
      openReactionPicker(message.id)
    );

  const threadButton = messageElement.querySelector('.start-thread');
  if (threadButton)
    threadButton.addEventListener('click', async () => {
      const { openThread } = await import('./threads.mjs');
      openThread(message.id);
    });

  const threadBadge = messageElement.querySelector('.thread-badge');
  if (threadBadge)
    threadBadge.addEventListener('click', async () => {
      const { openThread } = await import('./threads.mjs');
      openThread(message.id);
    });
}

const MESSAGE_PAGE_LIMIT = 50;
let isLoadingMore = false;

/**
 * @description Load messages in a given channel with pagination.
 */
export async function loadMessagesForChannel(channelId, before) {
  try {
    if (!before) {
      state.messageCache.clear();
      messagesArea.innerHTML = '';
    }

    let url = `/channels/${channelId}/messages?limit=${MESSAGE_PAGE_LIMIT}`;
    if (before) url += `&before=${before}`;

    const { messages } = await apiRequest(url);

    if (!messages || messages.length === 0) {
      if (!before) renderEmptyState();
      removeLoadMoreButton();
      return;
    }

    const messagesByDate = {};
    for (const message of messages) {
      const messageDate = formatDate(new Date(message.createdAt));
      state.messageCache.set(message.id, message);

      if (!messagesByDate[messageDate]) messagesByDate[messageDate] = [];
      messagesByDate[messageDate].push(message);
    }

    const sortedDates = Object.keys(messagesByDate).sort(
      (a, b) => new Date(b) - new Date(a)
    );

    const dividers = document.querySelectorAll('.message-date-divider');
    for (const date of sortedDates) {
      const dividerExists = Array.from(dividers).some(
        (div) => div.textContent === date
      );

      if (!dividerExists) {
        const dateDivider = document.createElement('div');
        dateDivider.className = 'message-date-divider';
        dateDivider.textContent = date;
        messagesArea.appendChild(dateDivider);
      }

      for (const message of messagesByDate[date]) await appendMessage(message);
    }

    // Show "load more" if we got a full page
    if (messages.length >= MESSAGE_PAGE_LIMIT) {
      showLoadMoreButton(channelId, messages[0].id);
    } else {
      removeLoadMoreButton();
    }
  } catch (error) {
    console.error('Error loading messages:', error);
    showToast('Failed to load messages', 'error');
  }
}

function showLoadMoreButton(channelId, oldestId) {
  removeLoadMoreButton();
  const btn = document.createElement('button');
  btn.className = 'load-more-btn';
  btn.id = 'load-more-messages';
  btn.textContent = 'Load older messages';
  btn.addEventListener('click', async () => {
    if (isLoadingMore) return;
    isLoadingMore = true;
    btn.textContent = 'Loading...';
    await loadMessagesForChannel(channelId, oldestId);
    isLoadingMore = false;
  });
  messagesArea.appendChild(btn);
}

function removeLoadMoreButton() {
  const existing = document.getElementById('load-more-messages');
  if (existing) existing.remove();
}

/**
 * @description Message area empty state rendering.
 */
export function renderEmptyState() {
  const existingEmptyStates = messagesArea.querySelectorAll('.empty-state');
  for (const element of existingEmptyStates) element.remove();

  const emptyState = document.createElement('div');
  emptyState.className = 'empty-state';
  emptyState.innerHTML = `
    <div class="empty-state-icon">💬</div>
    <h3>No messages yet</h3>
    <p>Start the conversation!</p>
  `;
  messagesArea.appendChild(emptyState);
}

/**
 * @description Update all references to a message ID in the DOM.
 */
export function updateMessageIds(oldId, newId) {
  const messageElement = document.querySelector(`.message[data-id="${oldId}"]`);
  if (messageElement) {
    messageElement.dataset.id = newId;

    const elements = messageElement.querySelectorAll(`[data-id="${oldId}"]`);
    for (const element of elements) {
      element.dataset.id = newId;
    }

    const reactions = messageElement.querySelectorAll(
      `[data-message-id="${oldId}"]`
    );
    for (const element of reactions) element.dataset.messageId = newId;
  }
}

/**
 * @description Update a message by ID.
 */
export async function updateMessage(messageId, content) {
  const actualId = getActualMessageId(messageId);
  if (!actualId) {
    showToast('Invalid message ID', 'error');
    return;
  }

  try {
    await apiRequest(`/messages/${actualId}`, 'PUT', { content });

    if (state.messageCache.has(messageId)) {
      const cachedMessage = state.messageCache.get(messageId);
      state.messageCache.set(messageId, {
        ...cachedMessage,
        content: content
      });
    }

    await updateMessageInUI({
      id: messageId,
      content: content
    });

    showToast('Message updated successfully');
  } catch (error) {
    showToast(error.message || 'Failed to update message', 'error');
  }
}

/**
 * @description Delete a message by ID.
 */
export async function deleteMessage(messageId) {
  const actualId = getActualMessageId(messageId);
  if (!actualId) {
    showToast('Invalid message ID', 'error');
    return;
  }

  if (!confirm('Are you sure you want to delete this message?')) return;

  try {
    await apiRequest(`/messages/${actualId}`, 'DELETE');

    removeMessageFromUI(messageId);

    showToast('Message deleted successfully');
  } catch (error) {
    showToast(error.message || 'Failed to delete message', 'error');
  }
}

/**
 * @description Updates a message in the user interface.
 */
export async function updateMessageInUI(message) {
  const messageElement = document.querySelector(
    `.message[data-id="${message.id}"]`
  );

  if (messageElement) {
    const messageTextElement = messageElement.querySelector('.message-text');
    if (messageTextElement) {
      let formattedContent = parseMarkdown(message.content);
      formattedContent = linkifyUrls(formattedContent);
      formattedContent = linkifyChannels(formattedContent);

      messageTextElement.innerHTML = formattedContent;
    }

    if (message.images && message.images.length > 0)
      await renderImagesInMessage(message.id, message.images);
  }
}

/**
 * @description Removes a message by ID from the user interface.
 */
export function removeMessageFromUI(messageId) {
  const messageElement = document.querySelector(
    `.message[data-id="${messageId}"]`
  );
  if (messageElement) {
    messageElement.remove();

    const dateDividers = document.querySelectorAll('.message-date-divider');
    for (const divider of dateDividers) {
      const nextElement = divider.nextElementSibling;

      // If there's no next element or it's another date divider, remove this divider
      if (
        !nextElement ||
        nextElement.classList.contains('message-date-divider')
      ) {
        divider.remove();
      }
    }

    if (!document.querySelector('.message')) renderEmptyState();
  }
}

/**
 * @description Detect and format URLs in a string.
 */
export function linkifyUrls(text) {
  const urlPattern = /https?:\/\/[^\s]+/g;
  return text.replace(
    urlPattern,
    (url) => `<a href="${url}" target="_blank" class="message-link">${url}</a>`
  );
}

/**
 * @description Format message content for display (markdown, URLs, channels).
 */
export function formatMessageContent(content) {
  if (!content) return '';
  let formatted = parseMarkdown(content);
  formatted = linkifyUrls(formatted);
  formatted = linkifyChannels(formatted);
  return formatted;
}

/**
 * @description Format message timestamp for display.
 */
export function formatMessageTime(timestamp) {
  return formatTime(new Date(timestamp));
}

/**
 * @description Detect and format channel mentions in a string.
 */
export function linkifyChannels(text) {
  const channelPattern = /#([a-zA-Z0-9_-]+)/g;

  return text.replace(channelPattern, (match, channelName) => {
    const channelEl = Array.from(
      channelsList.querySelectorAll('.channel-item')
    ).find(
      (item) =>
        item.querySelector('.channel-name').textContent.toLowerCase() ===
        channelName.toLowerCase()
    );

    const channelId = channelEl?.dataset.id || '';

    if (channelId)
      return `<a href="#" class="channel-link" data-channel-id="${channelId}" data-channel-name="${channelName}">${match}</a>`;

    return match;
  });
}

/**
 * @description Gets the real ID of a message, handling if a message is a temporary one.
 */
export function getActualMessageId(id) {
  if (id?.startsWith('temp-')) {
    const realId = state.tempIdMap.get(id);
    if (realId) return realId;
  }

  return id;
}

/**
 * @description Handle creating a temporary message when offline.
 * Creates a local temporary message that will be visible in the UI.
 */
export async function handleOfflineMessageCreation(_endpoint, data) {
  const tempId = `temp-${Date.now()}`;

  const tempMessage = {
    id: tempId,
    content: data.content || '',
    author: state.currentUser,
    createdAt: new Date().toISOString(),
    reactions: {},
    images: [],
    isOffline: true
  };

  state.messageCache.set(tempId, tempMessage);
  await appendMessage(tempMessage);

  showToast('Message saved locally. Will sync when online.', 'info');

  return { message: tempMessage };
}

/**
 * @description Remove a single image from a message.
 */
export async function removeImageFromMessage(messageId, filename) {
  try {
    const actualId = getActualMessageId(messageId);
    if (!actualId) {
      showToast('Invalid message ID', 'error');
      return;
    }

    const message = state.messageCache.get(messageId);
    if (!message || !message.images) {
      showToast('Message data not found', 'error');
      return;
    }

    if (!message.author || message.author.id !== state.currentUser.id) {
      showToast("You don't have permission to remove this image", 'error');
      return;
    }

    const updatedImages = message.images.filter((img) => img !== filename);
    await apiRequest(`/messages/${actualId}`, 'PUT', { images: updatedImages });
    message.images = updatedImages;
    state.messageCache.set(messageId, message);

    const imageContainer = document.getElementById(
      `img-container-${messageId}-${filename}`
    );
    if (imageContainer) imageContainer.remove();

    showToast('Image removed successfully');
  } catch (error) {
    showToast(error.message || 'Failed to remove image', 'error');
  }
}
