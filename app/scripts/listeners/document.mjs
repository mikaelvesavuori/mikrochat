document.addEventListener('click', () => {
  userDropdown.classList.remove('show');
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeAllModals();
});

/**
 * Close image preview with ESC key
 */
document.addEventListener('keydown', (event) => {
  if (
    event.key === 'Escape' &&
    imagePreviewModal.classList.contains('active')
  ) {
    imagePreviewModal.classList.remove('active');
  }
});

/**
 * Close sidebar when clicking outside on mobile
 */
document.addEventListener('click', (event) => {
  if (
    window.innerWidth <= 768 &&
    sidebar.classList.contains('open') &&
    !event.target.closest('.sidebar') &&
    !event.target.closest('.menu-toggle')
  ) {
    sidebar.classList.remove('open');
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    // Page is hidden, close SSE connection to free up server resources
    if (messageEventSource) {
      messageEventSource.close();
      messageEventSource = null;
    }
  } else if (document.visibilityState === 'visible') {
    // Page is visible again, restore connection if needed
    if (!messageEventSource && currentChannelId) {
      setupMessageEvents(currentChannelId);
    }
  }
});
