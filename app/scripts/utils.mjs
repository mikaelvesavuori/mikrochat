import { state } from './state.mjs';

/**
 * @description Get the user's initials.
 */
export function getInitials(name) {
  if (!name) return '?';
  return name
    .split(' ')
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase();
}

/**
 * @description Formats a Unix timestamp as a locale-adjusted date string.
 */
export function formatDate(timestamp) {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  return date.toLocaleDateString();
}

/**
 * @description Formats a Unix timestamp as a locale-adjusted time string.
 */
export function formatTime(timestamp) {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * @description Validates if a string is a valid email address.
 */
export function isValidEmail(email) {
  // Check if email is provided and is a string
  if (!email || typeof email !== 'string') return false;

  email = email.trim();

  if (email === '') return false;
  if (email.includes(' ')) return false;
  if (email.includes('..')) return false;

  // Check for @ symbol
  const atIndex = email.indexOf('@');
  if (atIndex === -1) return false;

  // Split email into local and domain parts
  const localPart = email.slice(0, atIndex);
  const domainPart = email.slice(atIndex + 1);

  // Check for empty local or domain parts
  if (localPart.length === 0 || domainPart.length === 0) return false;

  // Local part can contain: letters, numbers, dots, plus signs, underscores, hyphens and special chars
  const validLocalChars = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/;
  if (!validLocalChars.test(localPart)) return false;

  // Domain should have at least one dot and valid TLD
  const domainParts = domainPart.split('.');

  // Must have at least one dot (meaning at least 2 parts)
  if (domainParts.length < 2) return false;

  // TLD (last part) must be at least 2 characters and contain only letters
  const tld = domainParts[domainParts.length - 1];
  if (tld.length < 2 || !/^[a-zA-Z]+$/.test(tld)) return false;

  for (const part of domainParts) {
    // Domain parts cannot be empty
    if (part.length === 0) return false;

    // Domain parts can contain letters, numbers, and hyphens, but not start or end with hyphen
    if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(part)) return false;
  }

  return true;
}

/**
 * @description Sanitizes user input but preserves Markdown syntax.
 */
export function sanitizeInput(input) {
  if (typeof input !== 'string') {
    return '';
  }

  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * @description Parses Markdown syntax in the content.
 */
export function parseMarkdown(content) {
  if (!content) return '';

  let updatedContent = content;

  // Code fences - fix empty row issue
  updatedContent = updatedContent.replace(
    /```([\s\S]*?)```/g,
    function (_, codeContent) {
      return `<pre><code>${codeContent.trim()}</code></pre>`;
    }
  );

  // Bold with ** or __
  updatedContent = updatedContent.replace(
    /(\*\*|__)(.*?)\1/g,
    '<strong>$2</strong>'
  );

  // Italic with * or _
  updatedContent = updatedContent.replace(
    /(\*|_)(?!\*|_)(.*?)\1/g,
    '<em>$2</em>'
  );

  // Unordered lists with both - and *
  updatedContent = updatedContent.replace(
    /(?:^|\n)((?:(?:- |\* ).*(?:\n|$))+)/gm,
    function (_, list) {
      const items = list.split(/\n(?=(?:- |\* ))/);
      let html = '<ul>';
      for (const item of items) {
        if (item.trim()) {
          const content = item.replace(/^(?:- |\* )/, '').trim();
          html += `<li>${content}</li>`;
        }
      }
      html += '</ul>';
      return html;
    }
  );

  // Ordered lists
  updatedContent = updatedContent.replace(
    /(?:^|\n)((?:(?:\d+\. ).*(?:\n|$))+)/gm,
    function (_, list) {
      const items = list.split(/\n(?=(?:\d+\. ))/);
      let html = '<ol>';
      for (const item of items) {
        if (item.trim()) {
          const content = item.replace(/^\d+\. /, '').trim();
          html += `<li>${content}</li>`;
        }
      }
      html += '</ol>';
      return html;
    }
  );

  return updatedContent;
}

/**
 * @description Get the message with the provided ID from the DOM, if it exists.
 */
export function findMessageWithId(messageId) {
  const messages = Array.from(document.querySelectorAll('.message'));
  return messages.find((el) => el.dataset.id === messageId);
}

/**
 * @description Checks if a given message has received a specific emoji reaction from the user.
 */
export function hasUserReactedWithEmoji(messageId, reaction) {
  const reactionsContainer = getReactionsContainer(messageId);
  if (!reactionsContainer) return false;

  const userReactions = Array.from(
    reactionsContainer.querySelectorAll('.user-reacted')
  ).map((reaction) => reaction.dataset.reaction);

  return userReactions.some((r) => r === reaction);
}

/**
 * @description Get the container holding the reactions for a message.
 */
export function getReactionsContainer(messageId) {
  let targetElement = null;

  targetElement = findMessageWithId(messageId);

  if (!targetElement) {
    for (const [tempId, realId] of state.tempIdMap.entries()) {
      if (realId === messageId) {
        targetElement = findMessageWithId(tempId);
        if (targetElement) break;
      }
    }
  }

  if (!targetElement) return null;

  const reactionsContainer = targetElement.querySelector('.message-reactions');
  if (!reactionsContainer) return null;

  return reactionsContainer;
}
