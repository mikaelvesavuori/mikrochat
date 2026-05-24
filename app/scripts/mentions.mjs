import { state } from './state.mjs';
import { mentionSuggestions, messageInput } from './dom.mjs';
import { apiRequest } from './api.mjs';

export async function updateMentionSuggestions() {
  if (!mentionSuggestions || !messageInput) return;

  const cursor = messageInput.selectionStart;
  const beforeCursor = messageInput.value.slice(0, cursor);
  const match = beforeCursor.match(/@([a-zA-Z0-9_.-]*)$/);

  if (!match) {
    hideMentionSuggestions();
    return;
  }

  if (state.userCache.size === 0) {
    const response = await apiRequest('/users');
    for (const user of response.users || []) state.userCache.set(user.id, user);
  }

  const query = match[1].toLowerCase();
  const users = Array.from(state.userCache.values())
    .filter((user) => user.id !== state.currentUser?.id)
    .filter((user) => user.userName.toLowerCase().includes(query))
    .slice(0, 6);

  const broadcast = ['channel', 'here']
    .filter((name) => name.includes(query))
    .map((name) => ({ id: `@${name}`, userName: name }));

  const suggestions = [...broadcast, ...users];
  if (suggestions.length === 0) {
    hideMentionSuggestions();
    return;
  }

  mentionSuggestions.innerHTML = '';
  for (const suggestion of suggestions) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'mention-suggestion';
    item.textContent = `@${suggestion.userName}`;
    item.addEventListener('click', () => insertMention(suggestion.userName));
    mentionSuggestions.appendChild(item);
  }

  mentionSuggestions.style.display = 'flex';
}

export function hideMentionSuggestions() {
  if (mentionSuggestions) mentionSuggestions.style.display = 'none';
}

function insertMention(userName) {
  const cursor = messageInput.selectionStart;
  const beforeCursor = messageInput.value.slice(0, cursor);
  const afterCursor = messageInput.value.slice(cursor);
  const updatedBefore = beforeCursor.replace(/@([a-zA-Z0-9_.-]*)$/, `@${userName} `);

  messageInput.value = `${updatedBefore}${afterCursor}`;
  messageInput.focus();
  messageInput.selectionStart = updatedBefore.length;
  messageInput.selectionEnd = updatedBefore.length;
  messageInput.dispatchEvent(new Event('input', { bubbles: true }));
  hideMentionSuggestions();
}
