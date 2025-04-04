updateChannelSubmit.addEventListener('click', async () => {
  const name = editChannelNameInput.value.trim();
  if (name && currentChannelForEdit) {
    try {
      await updateChannelName(currentChannelForEdit.id, name);
      closeEditChannelModal();
    } catch (_error) {}
  } else {
    showToast('Please enter a channel name', 'error');
  }
});
