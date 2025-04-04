/**
 * @description Sets the theme (look) for MikroChat.
 */
async function setTheme(isDark) {
  if (isDark) {
    document.body.classList.remove('light-mode');
    themeSwitchIcon.textContent = '🌙';
    themeSwitchLabel.textContent = 'Dark Mode';
  } else {
    document.body.classList.add('light-mode');
    themeSwitchIcon.textContent = '☀️';
    themeSwitchLabel.textContent = 'Light Mode';
  }

  await storage.setItem('darkMode', isDark ? 'true' : 'false');
}
