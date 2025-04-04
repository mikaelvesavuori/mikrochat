reactionPicker.addEventListener('click', async (event) => {
  const item = event.target.closest('.reaction-item');

  if (item && currentMessageForReaction) {
    const reaction = item.dataset.reaction;
    await addReaction(currentMessageForReaction, reaction);
  }
});
