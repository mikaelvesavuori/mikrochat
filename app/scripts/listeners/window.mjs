window.openImagePreview = openImagePreview;

/**
 * Handle network reconnection
 */
window.addEventListener('online', async () => {
  if (currentChannelId) await setupMessageEvents(currentChannelId);
});

/**
 * Handle directing to the correct screen on load
 */
window.addEventListener('DOMContentLoaded', async () => {
  await handleStart();
});
