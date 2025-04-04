createChannelSubmit.addEventListener('click', () => {
  const name = channelNameInput.value.trim();
  if (name) {
    createChannel(name);
    closeCreateChannelModal();
  } else {
    showToast('Please enter a channel name', 'error');
  }
});
