/**
 * @description Thread (replies) related functionality.
 */
import { state } from './state.mjs';
import { apiRequest } from './api.mjs';
import { showToast, openEditModal } from './ui.mjs';
import { formatMessageContent, formatMessageTime } from './messages.mjs';
import { getInitials } from './utils.mjs';

/**
 * @description Open a thread panel for a parent message.
 */
export async function openThread(parentMessageId) {
  state.currentThreadId = parentMessageId;
  state.threadPanelOpen = true;

  const threadPanel = getOrCreateThreadPanel();
  threadPanel.classList.add('active');

  const parentMessage = state.messageCache.get(parentMessageId);
  renderThreadHeader(parentMessage);
  await loadThreadReplies(parentMessageId);
}

/**
 * @description Close the thread panel.
 */
export function closeThread() {
  state.currentThreadId = null;
  state.threadPanelOpen = false;

  const threadPanel = document.getElementById('thread-panel');
  if (threadPanel) threadPanel.classList.remove('active');
}

const THREAD_PAGE_LIMIT = 50;
let isLoadingMoreReplies = false;

/**
 * @description Load thread replies from the server with pagination.
 */
export async function loadThreadReplies(parentMessageId, before) {
  const threadMessages = document.getElementById('thread-messages');
  if (!threadMessages) return;

  try {
    let url = `/messages/${parentMessageId}/thread?limit=${THREAD_PAGE_LIMIT}`;
    if (before) url += `&before=${before}`;

    const response = await apiRequest(url);
    const replies = response.replies || [];

    if (!before) {
      state.threadMessageCache.set(parentMessageId, replies);
      renderThreadReplies(replies);
    } else {
      // Prepend older replies
      const cached = state.threadMessageCache.get(parentMessageId) || [];
      state.threadMessageCache.set(parentMessageId, [...replies, ...cached]);
      prependThreadReplies(replies);
    }

    if (replies.length >= THREAD_PAGE_LIMIT) {
      showThreadLoadMoreButton(parentMessageId, replies[0].id);
    } else {
      removeThreadLoadMoreButton();
    }
  } catch (error) {
    console.error('Failed to load thread replies:', error);
    if (!before) {
      threadMessages.innerHTML =
        '<div class="empty-state"><h3>Failed to load replies</h3></div>';
    }
  }
}

function prependThreadReplies(replies) {
  const threadMessages = document.getElementById('thread-messages');
  if (!threadMessages || replies.length === 0) return;
  removeThreadLoadMoreButton();
  let html = '';
  for (const reply of replies) {
    html += renderThreadReply(reply);
  }
  threadMessages.insertAdjacentHTML('afterbegin', html);
}

function showThreadLoadMoreButton(parentMessageId, oldestId) {
  removeThreadLoadMoreButton();
  const threadMessages = document.getElementById('thread-messages');
  if (!threadMessages) return;
  const btn = document.createElement('button');
  btn.className = 'load-more-btn';
  btn.id = 'load-more-thread-replies';
  btn.textContent = 'Load older replies';
  btn.addEventListener('click', async () => {
    if (isLoadingMoreReplies) return;
    isLoadingMoreReplies = true;
    btn.textContent = 'Loading...';
    await loadThreadReplies(parentMessageId, oldestId);
    isLoadingMoreReplies = false;
  });
  threadMessages.insertBefore(btn, threadMessages.firstChild);
}

function removeThreadLoadMoreButton() {
  const existing = document.getElementById('load-more-thread-replies');
  if (existing) existing.remove();
}

/**
 * @description Send a reply to a thread.
 */
export async function sendThreadReply(content) {
  if (!state.currentThreadId || !content.trim()) return;

  try {
    await apiRequest(`/messages/${state.currentThreadId}/thread`, 'POST', {
      content
    });

    const threadInput = document.getElementById('thread-message-input');
    if (threadInput) threadInput.value = '';
  } catch (error) {
    console.error('Failed to send thread reply:', error);
    showToast(error.message || 'Failed to send reply', 'error');
  }
}

/**
 * @description Delete a thread reply.
 */
export async function deleteThreadReply(replyId) {
  if (!state.currentThreadId) return;

  if (!confirm('Are you sure you want to delete this reply?')) return;

  try {
    await apiRequest(
      `/messages/${state.currentThreadId}/thread/${replyId}`,
      'DELETE'
    );
    showToast('Reply deleted', 'success');
  } catch (error) {
    console.error('Failed to delete thread reply:', error);
    showToast(error.message || 'Failed to delete reply', 'error');
  }
}

/**
 * @description Update a thread reply.
 */
export async function updateThreadReply(replyId, content) {
  if (!state.currentThreadId) return;

  try {
    await apiRequest(
      `/messages/${state.currentThreadId}/thread/${replyId}`,
      'PUT',
      { content }
    );
    showToast('Reply updated', 'success');
  } catch (error) {
    console.error('Failed to update thread reply:', error);
    showToast(error.message || 'Failed to update reply', 'error');
  }
}

// --- Rendering helpers ---

function getOrCreateThreadPanel() {
  let panel = document.getElementById('thread-panel');
  if (panel?.dataset.initialized) return panel;

  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'thread-panel';
    panel.className = 'thread-panel';
    const appContainer = document.getElementById('app-container');
    if (appContainer) appContainer.appendChild(panel);
  }

  panel.innerHTML = `
    <div class="thread-header" id="thread-header">
      <div class="thread-title">Thread</div>
      <button class="close-thread" id="close-thread-btn">&times;</button>
    </div>
    <div class="thread-parent" id="thread-parent"></div>
    <div class="thread-divider">Replies</div>
    <div class="thread-messages" id="thread-messages"></div>
    <div class="thread-input-area">
      <textarea class="message-input" id="thread-message-input" placeholder="Reply in thread..."></textarea>
      <button class="send-button" id="thread-send-button">&rarr;</button>
    </div>
  `;

  panel.dataset.initialized = 'true';

  document
    .getElementById('close-thread-btn')
    .addEventListener('click', closeThread);

  document
    .getElementById('thread-send-button')
    .addEventListener('click', () => {
      const input = document.getElementById('thread-message-input');
      if (input.value.trim()) sendThreadReply(input.value);
    });

  document
    .getElementById('thread-message-input')
    .addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        document.getElementById('thread-send-button').click();
      }
    });

  // Event delegation for thread reply actions
  document
    .getElementById('thread-messages')
    .addEventListener('click', async (event) => {
      const deleteBtn = event.target.closest('.thread-reply-delete');
      if (deleteBtn) {
        const replyId = deleteBtn.dataset.replyId;
        await deleteThreadReply(replyId);
        return;
      }

      const editBtn = event.target.closest('.thread-reply-edit');
      if (editBtn) {
        const replyId = editBtn.dataset.replyId;
        const replyEl = event.target.closest('.thread-reply');
        const content =
          replyEl?.querySelector('.message-text')?.textContent || '';
        openEditModal({ id: replyId, content });
        state.currentMessageForEdit = replyId;
        state.currentMessageForEditIsThread = true;
        return;
      }
    });

  return panel;
}

function renderThreadHeader(parentMessage) {
  const threadParent = document.getElementById('thread-parent');
  if (!threadParent || !parentMessage) return;

  const initials = getInitials(parentMessage.author?.userName || 'Unknown');
  const time = formatMessageTime(
    parentMessage.timestamp || parentMessage.createdAt
  );
  const content = formatMessageContent(parentMessage.content);

  threadParent.innerHTML = `
    <div class="message thread-parent-message">
      <div class="message-avatar">${initials}</div>
      <div class="message-content">
        <div class="message-header">
          <span class="message-author">${parentMessage.author?.userName || 'Unknown'}</span>
          <span class="message-time">${time}</span>
        </div>
        <div class="message-text">${content}</div>
      </div>
    </div>
  `;
}

function renderThreadReplies(replies) {
  const threadMessages = document.getElementById('thread-messages');
  if (!threadMessages) return;

  if (replies.length === 0) {
    threadMessages.innerHTML = `
      <div class="empty-state">
        <p>No replies yet. Start the conversation!</p>
      </div>
    `;
    return;
  }

  let html = '';
  for (const reply of replies) {
    html += renderThreadReply(reply);
  }
  threadMessages.innerHTML = html;
}

function renderThreadReply(reply) {
  const isOwnMessage = reply.author.id === state.currentUser?.id;
  const initials = getInitials(reply.author.userName);
  const time = formatMessageTime(reply.timestamp || reply.createdAt);
  const content = formatMessageContent(reply.content);

  let actionsHtml = '';
  if (isOwnMessage) {
    actionsHtml = `
      <div class="message-actions">
        <button class="message-edit thread-reply-edit" data-reply-id="${reply.id}">Edit</button>
        <button class="message-delete thread-reply-delete" data-reply-id="${reply.id}">Delete</button>
      </div>
    `;
  }

  return `
    <div class="message thread-reply" data-reply-id="${reply.id}">
      <div class="message-avatar">${initials}</div>
      <div class="message-content">
        <div class="message-header">
          <span class="message-author">${reply.author.userName}</span>
          <span class="message-time">${time}</span>
        </div>
        <div class="message-text">${content}</div>
        ${actionsHtml}
      </div>
    </div>
  `;
}

/**
 * @description Append a new thread reply from SSE.
 */
export function appendThreadReply(reply) {
  if (!state.threadPanelOpen || state.currentThreadId !== reply.threadId)
    return;

  const threadMessages = document.getElementById('thread-messages');
  if (!threadMessages) return;

  // Remove empty state if present
  const emptyState = threadMessages.querySelector('.empty-state');
  if (emptyState) emptyState.remove();

  // Check for duplicates
  if (threadMessages.querySelector(`[data-reply-id="${reply.id}"]`)) return;

  // Update cache
  const cached = state.threadMessageCache.get(reply.threadId) || [];
  cached.push(reply);
  state.threadMessageCache.set(reply.threadId, cached);

  const html = renderThreadReply(reply);
  threadMessages.insertAdjacentHTML('beforeend', html);
  threadMessages.scrollTop = threadMessages.scrollHeight;
}

/**
 * @description Update a thread reply in the panel from SSE.
 */
export function updateThreadReplyInView(reply) {
  if (!state.threadPanelOpen || state.currentThreadId !== reply.threadId)
    return;

  const existingEl = document.querySelector(`[data-reply-id="${reply.id}"]`);
  if (!existingEl) return;

  const html = renderThreadReply(reply);
  const temp = document.createElement('div');
  temp.innerHTML = html;
  existingEl.replaceWith(temp.firstElementChild);
}

/**
 * @description Remove a thread reply from the panel view.
 */
export function removeThreadReplyFromView(replyId, threadId) {
  if (!state.threadPanelOpen || state.currentThreadId !== threadId) return;

  const el = document.querySelector(`[data-reply-id="${replyId}"]`);
  if (el) el.remove();

  // Update cache
  const cached = state.threadMessageCache.get(threadId) || [];
  const filtered = cached.filter((r) => r.id !== replyId);
  state.threadMessageCache.set(threadId, filtered);

  if (filtered.length === 0) {
    const threadMessages = document.getElementById('thread-messages');
    if (threadMessages) {
      threadMessages.innerHTML =
        '<div class="empty-state"><p>No replies yet. Start the conversation!</p></div>';
    }
  }
}

/**
 * @description Update the thread reply count badge on a parent message in the channel view.
 */
export function updateThreadBadge(parentMessageId, threadMeta) {
  const messageEl = document.querySelector(
    `.message[data-id="${parentMessageId}"]`
  );
  if (!messageEl) return;

  let badge = messageEl.querySelector('.thread-badge');

  if (!threadMeta || threadMeta.replyCount === 0) {
    if (badge) badge.remove();
    return;
  }

  if (!badge) {
    badge = document.createElement('div');
    badge.className = 'thread-badge';
    badge.addEventListener('click', () => openThread(parentMessageId));

    const reactionsEl = messageEl.querySelector('.message-reactions');
    if (reactionsEl)
      reactionsEl.parentNode.insertBefore(badge, reactionsEl.nextSibling);
  }

  const replyText =
    threadMeta.replyCount === 1
      ? '1 reply'
      : `${threadMeta.replyCount} replies`;
  const lastReplyName = threadMeta.lastReplyBy?.userName || 'Someone';
  badge.innerHTML = `<span class="thread-badge-count">${replyText}</span> <span class="thread-badge-last">Last reply by ${lastReplyName}</span>`;
}
