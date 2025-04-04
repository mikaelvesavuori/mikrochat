/**
 * @description Load data for all channels on the server.
 */
async function loadChannels() {
  try {
    const { channels } = await apiRequest('/channels');

    channelsList.innerHTML = '';

    for (const channel of channels) await renderChannelItem(channel);

    if (channels.length > 0 && !currentChannelId) {
      const savedChannelId = await storage.getItem('currentChannelId');
      const channelToSelect =
        channels.find((c) => c.id === savedChannelId) || channels[0];
      await selectChannel(channelToSelect.id, channelToSelect.name);
    }

    return channels;
  } catch (_error) {
    showToast('Failed to load channels', 'error');
  }
}

/**
 * @description Navigate to a given channel.
 */
async function selectChannel(channelId, channelName) {
  if (channelId === currentChannelId) return;

  currentChannelId = channelId;
  currentChannelName.textContent = channelName;
  await storage.setItem('currentChannelId', channelId);

  // Reset unread count for this channel
  unreadCounts.set(channelId, 0);

  const channels = channelsList.querySelectorAll('.channel-item');
  for (const channel of channels) {
    if (channel.dataset.id === channelId) {
      channel.classList.add('active');

      // Update the channel item to remove notification badge
      const channelObj = { id: channelId, name: channelName };
      if (channel.querySelector('.channel-settings'))
        channelObj.createdBy = currentUser.id;

      await renderChannelItem(channelObj);
    } else {
      channel.classList.remove('active');
    }
  }

  await loadMessagesForChannel(channelId);

  await setupMessageEvents(channelId);
}

/**
 * @description Create a channel and then directly navigate to it.
 */
async function createChannel(name) {
  try {
    const { channel } = await apiRequest('/channels', 'POST', { name });
    showToast(`Channel #${name} created successfully!`);
    await loadChannels();
    await selectChannel(channel.id, channel.name);
  } catch (error) {
    showToast(error.message || 'Failed to create channel', 'error');
    throw error;
  }
}

/**
 * @description Delete a channel and then navigate directly to the first ("General") channel.
 */
async function deleteChannel(channelId) {
  try {
    await apiRequest(`/channels/${channelId}`, 'DELETE');
    showToast('Channel deleted successfully');
    const channels = await loadChannels();
    await selectChannel(channels[0].id, channels[0].name);
  } catch (error) {
    showToast(error.message || 'Failed to delete channel', 'error');
    throw error;
  }
}

/**
 * @description Update the name of a channel.
 */
async function updateChannelName(channelId, name) {
  try {
    const { channel } = await apiRequest(`/channels/${channelId}`, 'PUT', {
      name
    });
    showToast(`Channel renamed to #${name} successfully`);

    // Update current channel name if we're viewing the updated channel
    if (currentChannelId === channelId) currentChannelName.textContent = name;

    await loadChannels();

    return channel;
  } catch (error) {
    showToast(error.message || 'Failed to update channel name', 'error');
    throw error;
  }
}

/**
 * @description Navigate to the last used channel.
 */
async function restoreLastChannel() {
  const savedChannelId = await storage.getItem('currentChannelId');
  if (!savedChannelId) return;

  const channelEl = document.querySelector(
    `.channel-item[data-id="${savedChannelId}"]`
  );
  if (channelEl) channelEl.click();
}
