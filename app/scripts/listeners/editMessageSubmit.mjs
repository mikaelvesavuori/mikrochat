editMessageSubmit.addEventListener('click', async () => {
  const content = editMessageInput.value.trim();

  if (content && currentMessageForEdit) {
    await updateMessage(currentMessageForEdit, content);
    closeEditModal();
  } else {
    showToast('Please enter message content', 'error');
  }
});
