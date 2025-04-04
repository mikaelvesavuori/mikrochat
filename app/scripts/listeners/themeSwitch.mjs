themeSwitch.addEventListener('click', async () => {
  const isDarkMode = !document.body.classList.contains('light-mode');
  await setTheme(!isDarkMode);
});
