import { state } from './state.mjs';
import { API_BASE_URL, DEBUG_MODE } from './config.mjs';
import { getAccessToken, signout } from './auth.mjs';
import { showToast, renderChannelItem, updateDocumentTitle, showDesktopNotification } from './ui.mjs';
import { appendMessage, updateMessageInUI, removeMessageFromUI } from './messages.mjs';
import { updateReactionInUI } from './reactions.mjs';
import { loadChannels } from './channels.mjs';
import { loadConversations, updateConversationInCache, incrementDmUnread } from './conversations.mjs';
import { appendDMMessage, updateDMMessageInView, removeDMMessageFromView } from './dmMessages.mjs';

// Event-specific globals
const MAX_SSE_RECONNECT_ATTEMPTS = 5;
const MAX_SSE_ERRORS_REPORTED = 3;
let sseReconnectAttempts = 0;
let sseReconnectTimeout = null;
let sseErrorsReported = 0;

/**
 * @description Sets up the handling of Server Side Events,
 * to allow for real-time updates inside MikroChat.
 */
export async function setupMessageEvents(channelId) {
  if (state.messageEventSource) {
    state.messageEventSource.close();
    state.messageEventSource = null;
  }

  if (sseReconnectTimeout) {
    clearTimeout(sseReconnectTimeout);
    sseReconnectTimeout = null;
  }

  const token = await getAccessToken();
  if (!token) return;

  try {
    // Create new SSE connection
    state.messageEventSource = new EventSource(
      `${API_BASE_URL}/events?token=${token}`
    );

    // Connection opened successfully
    state.messageEventSource.onopen = function () {
      sseReconnectAttempts = 0;
      sseErrorsReported = 0;
    };

    // Handle incoming messages
    state.messageEventSource.onmessage = async function (event) {
      try {
        const data = JSON.parse(event.data);

        if (DEBUG_MODE)
          console.log(`SSE event received: ${data.type}`, data.payload);

        switch (data.type) {
          case 'CONNECTED':
            break;

          case 'NEW_MESSAGE':
            // If message is for current channel, append it
            if (data.payload.channelId === state.currentChannelId) {
              await appendMessage(data.payload);
            } else {
              // Otherwise, increment the unread count
              const currentCount =
                state.unreadCounts.get(data.payload.channelId) || 0;
              state.unreadCounts.set(data.payload.channelId, currentCount + 1);

              // Find the channel in the list and update it
              const channelEl = document.querySelector(
                `.channel-item[data-id="${data.payload.channelId}"]`
              );
              if (channelEl) {
                const channelName =
                  channelEl.querySelector('.channel-name').textContent;
                await renderChannelItem({
                  id: data.payload.channelId,
                  name: channelName
                });
              }

              // Show toast notification for the message
              const authorName = data.payload.author?.userName || 'Someone';
              const channelName = channelEl
                ? channelEl.querySelector('.channel-name').textContent
                : 'another channel';
              showToast(`${authorName} posted in #${channelName}`, 'info');
              updateDocumentTitle();
              showDesktopNotification(`#${channelName}`, `${authorName}: ${data.payload.content}`);
            }
            break;

          case 'UPDATE_MESSAGE':
            if (data.payload.channelId === state.currentChannelId) {
              if (state.messageCache.has(data.payload.id)) {
                state.messageCache.set(data.payload.id, {
                  ...state.messageCache.get(data.payload.id),
                  content: data.payload.content,
                  images: data.payload.images,
                  updatedAt: data.payload.updatedAt
                });
              }
              await updateMessageInUI(data.payload);
            }
            break;

          case 'DELETE_MESSAGE':
            if (data.payload.channelId === state.currentChannelId) {
              state.messageCache.delete(data.payload.id);
              removeMessageFromUI(data.payload.id);
            }
            break;

          case 'NEW_CHANNEL':
            loadChannels();
            break;

          case 'NEW_REACTION':
            // We don't have a channelId here, so let's just accept
            if (data.payload.messageId) {
              const messageId = data.payload.messageId;
              const userId = data.payload.userId;
              const reaction = data.payload.reaction;

              if (userId !== state.currentUser.id)
                await updateReactionInUI(messageId, reaction, true, true);
            }
            break;

          case 'DELETE_REACTION':
            // We don't have a channelId here, so let's just accept
            if (data.payload.messageId) {
              const messageId = data.payload.messageId;
              const userId = data.payload.userId;
              const reaction = data.payload.reaction;

              // Update cache regardless of who triggered it
              if (state.messageCache.has(messageId)) {
                const cachedMsg = state.messageCache.get(messageId);
                if (cachedMsg.reactions?.[reaction]) {
                  cachedMsg.reactions[reaction] = cachedMsg.reactions[
                    reaction
                  ].filter((id) => id !== userId);
                  if (cachedMsg.reactions[reaction].length === 0) {
                    delete cachedMsg.reactions[reaction];
                  }
                  state.messageCache.set(messageId, cachedMsg);
                }
              }

              if (userId !== state.currentUser.id)
                await updateReactionInUI(messageId, reaction, false, true);
            }
            break;

          case 'REMOVE_USER':
            if (data.payload.id === state.currentUser.id) {
              await signout();
            }
            break;

          case 'NEW_CONVERSATION':
            // Refresh conversations list
            await loadConversations();
            break;

          case 'NEW_DM_MESSAGE':
            // If this DM is for a conversation the user is part of
            if (data.payload.channelId.startsWith('dm:')) {
              if (state.viewMode === 'dm' && data.payload.channelId === state.currentConversationId) {
                // User is viewing this conversation - append the message
                appendDMMessage(data.payload);
              } else {
                // User is not viewing this conversation - increment unread
                incrementDmUnread(data.payload.channelId);

                // Show toast notification
                const authorName = data.payload.author?.userName || 'Someone';
                showToast(`${authorName} sent you a direct message`, 'info');
                updateDocumentTitle();
                showDesktopNotification('Direct Message', `${authorName}: ${data.payload.content}`);
              }

              // Update conversation's lastMessageAt
              const conv = state.conversationCache.get(data.payload.channelId);
              if (conv) {
                conv.lastMessageAt = data.payload.createdAt;
                updateConversationInCache(conv);
              }
            }
            break;

          case 'UPDATE_DM_MESSAGE':
            if (data.payload.channelId.startsWith('dm:')) {
              updateDMMessageInView(data.payload);
            }
            break;

          case 'DELETE_DM_MESSAGE':
            if (data.payload.conversationId) {
              removeDMMessageFromView(data.payload.id, data.payload.conversationId);
            }
            break;

          case 'NEW_THREAD_REPLY': {
            const { appendThreadReply, updateThreadBadge } = await import('./threads.mjs');

            if (data.payload.channelId === state.currentChannelId) {
              updateThreadBadge(data.payload.parentMessageId, data.payload.threadMeta);
            }

            appendThreadReply(data.payload.reply);

            if (data.payload.reply.author.id !== state.currentUser.id) {
              const authorName = data.payload.reply.author?.userName || 'Someone';
              showToast(`${authorName} replied in a thread`, 'info');
              showDesktopNotification('Thread Reply', `${authorName}: ${data.payload.reply.content}`);
            }
            break;
          }

          case 'UPDATE_THREAD_REPLY': {
            const { updateThreadReplyInView } = await import('./threads.mjs');
            updateThreadReplyInView(data.payload);
            break;
          }

          case 'DELETE_THREAD_REPLY': {
            const { removeThreadReplyFromView, updateThreadBadge: updateBadge } = await import('./threads.mjs');

            if (data.payload.channelId === state.currentChannelId) {
              updateBadge(data.payload.threadId, data.payload.threadMeta);
            }

            removeThreadReplyFromView(data.payload.id, data.payload.threadId);
            break;
          }

          case 'NEW_WEBHOOK':
          case 'DELETE_WEBHOOK': {
            if (document.getElementById('server-settings-modal')?.classList.contains('active')) {
              const { loadWebhooks } = await import('./webhooks.mjs');
              loadWebhooks();
            }
            break;
          }
        }
      } catch (error) {
        console.error('Error processing SSE event', error);
      }
    };

    state.messageEventSource.onerror = function (_error) {
      if (sseErrorsReported < MAX_SSE_ERRORS_REPORTED) sseErrorsReported++;

      if (
        state.messageEventSource &&
        state.messageEventSource.readyState === EventSource.CLOSED
      ) {
        state.messageEventSource.close();
        state.messageEventSource = null;

        sseReconnectAttempts++;
        const delay = Math.min(1000 * 2 ** sseReconnectAttempts, 30 * 1000);

        if (sseReconnectAttempts <= MAX_SSE_RECONNECT_ATTEMPTS) {
          console.log(
            `SSE reconnect attempt ${sseReconnectAttempts} in ${delay}ms`
          );
          sseReconnectTimeout = setTimeout(async () => {
            await setupMessageEvents(channelId);
          }, delay);
        } else {
          console.log(
            'Maximum SSE reconnect attempts reached, trying again in 60s'
          );
          sseReconnectAttempts = 0;
          sseReconnectTimeout = setTimeout(async () => {
            await setupMessageEvents(channelId);
          }, 60 * 1000);
        }
      }
    };
  } catch (error) {
    console.error('Error setting up SSE connection', error);
  }
}

/**
 * @description Listen for online/offline network changes and update UI accordingly.
 */
export function setupNetworkListeners() {
  const offlineBar = document.getElementById('offline-bar');
  const messageInput = document.getElementById('message-input');
  const sendButton = document.getElementById('send-button');

  function setOffline() {
    state.isOffline = true;
    if (offlineBar) offlineBar.classList.add('visible');
    if (messageInput) messageInput.disabled = true;
    if (sendButton) sendButton.disabled = true;
    showToast('You are offline', 'error');
  }

  function setOnline() {
    state.isOffline = false;
    if (offlineBar) offlineBar.classList.remove('visible');
    if (messageInput) messageInput.disabled = false;
    if (sendButton) sendButton.disabled = false;
    showToast('You are back online', 'success');
  }

  window.addEventListener('offline', setOffline);
  window.addEventListener('online', setOnline);

  // Set initial state
  if (!navigator.onLine) setOffline();
}
