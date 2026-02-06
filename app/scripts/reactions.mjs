import { state } from './state.mjs';
import { reactionPickerModal } from './dom.mjs';
import { apiRequest } from './api.mjs';
import {
  showToast,
  getReactionCount,
  updateReactionCount,
  reacted,
  renderReaction
} from './ui.mjs';
import { hasUserReactedWithEmoji, findMessageWithId } from './utils.mjs';
import { getActualMessageId } from './messages.mjs';

/**
 * @description Process and group reactions into a ready-to-use format.
 */
export function processReactions(reactions) {
  const reactionsByEmoji = {};

  if (!reactions) return reactionsByEmoji;

  for (const [userId, emojis] of Object.entries(reactions)) {
    if (!emojis) return;

    for (const emoji of emojis) {
      if (!reactionsByEmoji[emoji]) reactionsByEmoji[emoji] = [];
      reactionsByEmoji[emoji].push(userId);
    }
  }

  return reactionsByEmoji;
}

/**
 * @description User interaction leading to adding a reaction (emoji) to a message.
 */
export async function addReaction(messageId, reaction) {
  const actualId = getActualMessageId(messageId);
  if (!actualId) {
    showToast('Invalid message ID', 'error');
    return;
  }

  // Additional safeguard to ensure we don't let users add reactions more than once
  if (hasUserReactedWithEmoji(messageId, reaction)) return;

  try {
    if (state.messageCache.has(messageId)) {
      const cachedMessage = state.messageCache.get(messageId);
      if (!cachedMessage.reactions) cachedMessage.reactions = {};

      if (!cachedMessage.reactions[reaction])
        cachedMessage.reactions[reaction] = [state.currentUser.id];
      else if (!cachedMessage.reactions[reaction].includes(state.currentUser.id))
        cachedMessage.reactions[reaction].push(state.currentUser.id);

      state.messageCache.set(messageId, cachedMessage);
    }

    await apiRequest(`/messages/${actualId}/reactions`, 'POST', {
      reaction
    });

    await updateReactionInUI(messageId, reaction, true, false);

    reactionPickerModal.classList.remove('active');
  } catch (error) {
    await updateReactionInUI(messageId, reaction, false, false);
    showToast(error.message || 'Failed to add reaction', 'error');
  }
}

/**
 * @description User interaction leading to removing a reaction (emoji) to a message.
 */
export async function removeReaction(messageId, reaction) {
  const actualId = getActualMessageId(messageId);
  if (!actualId) {
    showToast('Invalid message ID', 'error');
    return;
  }

  try {
    await apiRequest(`/messages/${actualId}/reactions`, 'DELETE', {
      reaction
    });

    await updateReactionInUI(messageId, reaction, false, false);
  } catch (error) {
    await updateReactionInUI(messageId, reaction, true, false);
    showToast(error.message || 'Failed to remove reaction', 'error');
  }
}

/**
 * @description Update the UI state for a reaction.
 */
export async function updateReactionInUI(
  messageId,
  reaction,
  isAdding,
  isEffectOfOtherUserInteraction = false
) {
  const reactionsContainer = getReactionsContainerLocal(messageId);
  if (!reactionsContainer) return;

  const existingReaction = reactionsContainer.querySelector(
    `.reaction[data-reaction="${reaction}"]`
  );

  const count = getReactionCount(existingReaction);

  // Handle when a reaction was added by someone else and the reaction does not exist with the current user
  if (isEffectOfOtherUserInteraction) {
    if (isAdding) {
      if (existingReaction) updateReactionCount(existingReaction, count + 1);
      else await renderReaction(messageId, reaction, 1, false);
    } else {
      if (existingReaction) {
        if (getReactionCount(existingReaction) - 1 >= 1)
          updateReactionCount(existingReaction, count - 1);
        else existingReaction.remove();
      }
    }
    return;
  }

  // These cases cover when the user actually interacts with the reactions
  if (isAdding) {
    if (existingReaction) {
      updateReactionCount(existingReaction, count + 1);
      reacted(existingReaction, isAdding);
    } else {
      await renderReaction(messageId, reaction, 1, true);
    }
  } else {
    // Can only remove existing reaction
    if (existingReaction) {
      if (count > 1) {
        updateReactionCount(existingReaction, count - 1);
        reacted(existingReaction, isAdding);
      } else {
        existingReaction.remove();
      }
    }
  }
}

/**
 * @description Get the container holding the reactions for a message.
 * Note: This is duplicated from utils.mjs to avoid circular dependency.
 */
function getReactionsContainerLocal(messageId) {
  let targetElement = null;

  targetElement = findMessageWithId(messageId);

  if (!targetElement) {
    for (const [tempId, realId] of state.tempIdMap.entries()) {
      if (realId === messageId) {
        targetElement = findMessageWithId(tempId);
        if (targetElement) break;
      }
    }
  }

  if (!targetElement) return;

  const reactionsContainer = targetElement.querySelector('.message-reactions');
  if (!reactionsContainer) return;

  return reactionsContainer;
}
