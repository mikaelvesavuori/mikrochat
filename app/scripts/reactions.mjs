/**
 * @description Process and group reactions into a ready-to-use format.
 */
function processReactions(reactions) {
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
async function addReaction(messageId, reaction) {
  const actualId = getActualMessageId(messageId);
  if (!actualId) {
    showToast('Invalid message ID', 'error');
    return;
  }

  // Additional safeguard to ensure we don't let users add reactions more than once
  if (hasUserReactedWithEmoji(messageId, reaction)) return;

  try {
    if (messageCache.has(messageId)) {
      const cachedMessage = messageCache.get(messageId);
      if (!cachedMessage.reactions) cachedMessage.reactions = {};

      if (!cachedMessage.reactions[reaction])
        cachedMessage.reactions[reaction] = [currentUser.id];
      else if (!cachedMessage.reactions[reaction].includes(currentUser.id))
        cachedMessage.reactions[reaction].push(currentUser.id);

      messageCache.set(messageId, cachedMessage);
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
async function removeReaction(messageId, reaction) {
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
async function updateReactionInUI(
  messageId,
  reaction,
  isAdding,
  isEffectOfOtherUserInteraction = false
) {
  const reactionsContainer = getReactionsContainer(messageId);

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
 */
function getReactionsContainer(messageId) {
  let targetElement = null;

  targetElement = findMessageWithId(messageId);

  if (!targetElement) {
    for (const [tempId, realId] of tempIdMap.entries()) {
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
