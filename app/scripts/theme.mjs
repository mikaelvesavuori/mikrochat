import { state } from './state.mjs';
import { themeSwitchIcon, themeSwitchLabel } from './dom.mjs';

/**
 * @description Sets the theme (look) for MikroChat.
 */
export async function setTheme(isDark) {
  if (isDark) {
    document.body.classList.remove('light-mode');
    if (themeSwitchIcon) themeSwitchIcon.textContent = '🌙';
    if (themeSwitchLabel) themeSwitchLabel.textContent = 'Dark Mode';
  } else {
    document.body.classList.add('light-mode');
    if (themeSwitchIcon) themeSwitchIcon.textContent = '☀️';
    if (themeSwitchLabel) themeSwitchLabel.textContent = 'Light Mode';
  }

  await state.storage.setItem('darkMode', isDark ? 'true' : 'false');
}
