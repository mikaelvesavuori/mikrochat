deleteChannelButton.addEventListener('click', async () => {
  if (
    currentChannelForEdit &&
    confirm(
      `Are you sure you want to delete #${currentChannelForEdit.name}? This action cannot be undone.`
    )
  ) {
    await deleteChannel(currentChannelForEdit.id);
    closeEditChannelModal();
  }
});
