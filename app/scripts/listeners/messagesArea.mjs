messagesArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  messagesArea.classList.add('drag-over');
});

messagesArea.addEventListener('dragleave', () => {
  messagesArea.classList.remove('drag-over');
});

messagesArea.addEventListener('drop', (e) => {
  e.preventDefault();
  messagesArea.classList.remove('drag-over');

  if (e.dataTransfer.files.length > 0) handleAddImages(e.dataTransfer.files);
});

messagesArea.addEventListener('click', async (event) => {
  const channelLink = event.target.closest('.channel-link');

  if (channelLink) {
    event.preventDefault();
    const channelId = channelLink.dataset.channelId;
    const channelName = channelLink.dataset.channelName;

    if (channelId) await selectChannel(channelId, channelName);
  }
});
