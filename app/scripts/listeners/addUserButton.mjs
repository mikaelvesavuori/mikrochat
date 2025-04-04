addUserButton.addEventListener('click', () => {
  const email = addEmailInput.value.trim();
  const role = document.querySelector('input[name="user-role"]:checked').value;

  if (email) {
    if (validateEmail(email)) {
      addUser(email, role);
      addEmailInput.value = '';
    } else {
      showToast('Please enter a valid email address', 'error');
    }
  } else {
    showToast('Please enter an email address', 'error');
  }
});

function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}
