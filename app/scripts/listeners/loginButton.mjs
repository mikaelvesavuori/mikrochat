loginButton.addEventListener('click', () => {
  const email = emailInput.value.trim();
  const encryptionPassword = encryptionPasswordInput
    ? encryptionPasswordInput.value?.trim()
    : null;

  signin(email, encryptionPassword);
});
