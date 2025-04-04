messageInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    const content = messageInput.value;
    sendMessage(content);
  }
});
