encryptionPasswordInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    encryptionPasswordInput.value = '';
    loginButton.click();
  }
});
