updateServerNameButton.addEventListener('click', async () => {
  const name = serverNameInput.value.trim();
  if (name) {
    await updateServerName(name);
  } else {
    showToast('Please enter a server name', 'error');
  }
});
