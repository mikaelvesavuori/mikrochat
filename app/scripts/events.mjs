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
async function setupMessageEvents(channelId) {
  if (messageEventSource) {
    messageEventSource.close();
    messageEventSource = null;
  }

  if (sseReconnectTimeout) {
    clearTimeout(sseReconnectTimeout);
    sseReconnectTimeout = null;
  }

  const token = await getAccessToken();
  if (!token) return;

  try {
    // Create new SSE connection
    messageEventSource = new EventSource(
      `${API_BASE_URL}/events?token=${token}`
    );

    // Connection opened successfully
    messageEventSource.onopen = function () {
      sseReconnectAttempts = 0;
      sseErrorsReported = 0;
    };

    // Handle incoming messages
    messageEventSource.onmessage = async function (event) {
      try {
        const data = JSON.parse(event.data);

        if (DEBUG_MODE)
          console.log(`SSE event received: ${data.type}`, data.payload);

        switch (data.type) {
          case 'CONNECTED':
            break;

          case 'NEW_MESSAGE':
            // If message is for current channel, append it
            if (data.payload.channelId === currentChannelId) {
              await appendMessage(data.payload);
            } else {
              // Otherwise, increment the unread count
              const currentCount =
                unreadCounts.get(data.payload.channelId) || 0;
              unreadCounts.set(data.payload.channelId, currentCount + 1);

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
            }
            break;

          case 'UPDATE_MESSAGE':
            if (data.payload.channelId === currentChannelId) {
              if (messageCache.has(data.payload.id)) {
                messageCache.set(data.payload.id, {
                  ...messageCache.get(data.payload.id),
                  content: data.payload.content,
                  images: data.payload.images,
                  updatedAt: data.payload.updatedAt
                });
              }
              await updateMessageInUI(data.payload);
            }
            break;

          case 'DELETE_MESSAGE':
            if (data.payload.channelId === currentChannelId) {
              messageCache.delete(data.payload.id);
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

              if (userId !== currentUser.id)
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
              if (messageCache.has(messageId)) {
                const cachedMsg = messageCache.get(messageId);
                if (cachedMsg.reactions?.[reaction]) {
                  cachedMsg.reactions[reaction] = cachedMsg.reactions[
                    reaction
                  ].filter((id) => id !== userId);
                  if (cachedMsg.reactions[reaction].length === 0) {
                    delete cachedMsg.reactions[reaction];
                  }
                  messageCache.set(messageId, cachedMsg);
                }
              }

              if (userId !== currentUser.id)
                await updateReactionInUI(messageId, reaction, false, true);
            }
            break;

          case 'REMOVE_USER':
            if (data.payload.id === currentUser.id) {
              await signout();
            }
            break;
        }
      } catch (error) {
        console.error('Error processing SSE event', error);
      }
    };

    messageEventSource.onerror = function (_error) {
      if (sseErrorsReported < MAX_SSE_ERRORS_REPORTED) sseErrorsReported++;

      if (
        messageEventSource &&
        messageEventSource.readyState === EventSource.CLOSED
      ) {
        messageEventSource.close();
        messageEventSource = null;

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
