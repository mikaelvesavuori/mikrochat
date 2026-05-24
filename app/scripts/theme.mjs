import { themeSwitchIcon, themeSwitchLabel } from './dom.mjs';
import { icon } from './icons.mjs';
import { storage } from './storage.mjs';

/**
 * @description Sets the theme (look) for MikroChat.
 */
export async function setTheme(isDark) {
  if (isDark) {
    document.body.classList.remove('light-mode');
    if (themeSwitchIcon) themeSwitchIcon.innerHTML = icon('moon');
    if (themeSwitchLabel) themeSwitchLabel.textContent = 'Dark Mode';
  } else {
    document.body.classList.add('light-mode');
    if (themeSwitchIcon) themeSwitchIcon.innerHTML = icon('sun');
    if (themeSwitchLabel) themeSwitchLabel.textContent = 'Light Mode';
  }

  await storage.setItem('darkMode', isDark ? 'true' : 'false');
}
