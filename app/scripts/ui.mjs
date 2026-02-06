import { state } from './state.mjs';
import {
  authContainer,
  appContainer,
  emailInput,
  loginButton,
  textElement,
  encryptionForm,
  emailForm,
  authPasswordGroup,
  authPasswordConfirmGroup,
  authToggle,
  authToggleLink,
  userAvatar,
  userName,
  channelsList,
  toast,
  loading,
  createChannelModal,
  channelNameInput,
  reactionPickerModal,
  editMessageInput,
  editMessageModal,
  editChannelNameInput,
  editChannelModal
} from './dom.mjs';
import { AUTH_MODE, DEFAULT_PASSWORD } from './config.mjs';
import { getUrlParams } from './url.mjs';
import { isMagicLinkUrl } from './magiclink.mjs';
import { isAuthenticated, isEncryptionPasswordRequired, getUserInfo } from './auth.mjs';
import { setupStorage } from './storage.mjs';
import { getInitials, getReactionsContainer } from './utils.mjs';
import { setTheme } from './theme.mjs';

/////////////
// SCREENS //
/////////////

/**
 * @description Handles the rendering of the auth screen.
 */
export async function showAuthScreen() {
  closeAllModals();

  authContainer.style.display = 'block';
  appContainer.style.display = 'none';

  const authed = isAuthenticated();

  /*
  // Cases for Dev Mode
  - Already authenticated, shared encryption key -> <App screen>
  - Already authenticated, user-specific encryption key -> Display encryption key input -> <App screen>
  - Unauthenticated, shared encryption key -> Display email input -> <App screen>
  - Unauthenticated, user-specific encryption key -> Display email + encryption key input -> <App screen>
  */
  if (AUTH_MODE === 'dev') {
    if (isEncryptionPasswordRequired())
      return renderDevModeEncryptionSignInView();

    if (authed) return renderDevModeEncryptionSignInView();

    return renderDevModePlainSignInView();
  }

  /*
  // Cases for Magic Link Mode
  - On magic link URL with email and token parameters, shared encryption key -> <App screen>
  - On magic link URL with email and token parameters, user-specific encryption key -> Display encryption key input -> <App screen>
  - Already authenticated, shared encryption key -> <App screen>
  - Already authenticated, user-specific encryption key -> Display encryption key input -> <App screen>
  - Unauthenticated, shared encryption key -> Display email input -> <Success screen>
  - Unauthenticated, user-specific encryption key -> Display email input -> <Success screen>
  */
  if (AUTH_MODE === 'magic-link') {
    if (isMagicLinkUrl()) {
      if (isEncryptionPasswordRequired())
        return renderMagicLinkEncryptionSignInView();

      return signInWithMagicLink();
    }

    if (authed) {
      if (isEncryptionPasswordRequired())
        return renderMagicLinkEncryptionSignInView();

      // Sign in pre-authenticated user with default encryption key
      await setupStorage(DEFAULT_PASSWORD);
      //return await showAppScreen();
    }

    return renderMagicLinkUnauthenticatedView();
  }

  /*
  // Cases for Password Mode
  - On invite URL with email and token parameters -> Display "Set your password" form
  - Already authenticated -> <App screen>
  - Unauthenticated -> Display email + password sign in form
  */
  if (AUTH_MODE === 'password') {
    const { emailParam, tokenParam } = getUrlParams();

    if (emailParam && tokenParam) return renderPasswordSetupView(emailParam);

    if (authed) {
      await setupStorage(DEFAULT_PASSWORD);
      return await showAppScreen();
    }

    return renderPasswordSignInView();
  }
}

/**
 * @description Sign in user with magic link URL parameters.
 */
export function signInWithMagicLink() {
  const { emailParam } = getUrlParams();
  emailInput.value = emailParam;
  loginButton.click();
}

/**
 * @description Dev mode sign in: Only show email input.
 */
export function renderDevModePlainSignInView() {
  textElement.textContent = 'Enter your email to sign in.';
  encryptionForm.style.display = 'none';

  hideLoading();
}

/**
 * @description Dev mode sign in: Show both email and encryption key inputs.
 */
export function renderDevModeEncryptionSignInView() {
  textElement.textContent = 'Enter your email and encryption key to sign in.';
  encryptionForm.style.display = 'block';

  hideLoading();
}

/**
 * @description Magic link sign in: Show encryption input and only show email input
 * if the user is not on a magic link URL path.
 */
export function renderMagicLinkEncryptionSignInView() {
  textElement.textContent = 'Enter your encryption key to sign in.';

  const hideEmail = isMagicLinkUrl();
  if (hideEmail) {
    // Hide email input and autofill it with the value from the URL
    emailForm.getElementsByTagName('label')[0].style.display = 'none';
    emailInput.style.display = 'none';
    const { emailParam } = getUrlParams();
    emailInput.value = emailParam;
  }

  encryptionForm.style.display = 'block';

  hideLoading();
}

/**
 * @description Magic link sign in: Show only the email input.
 */
export function renderMagicLinkUnauthenticatedView() {
  textElement.textContent = 'Enter your email to get a magic link.';
  encryptionForm.style.display = 'none';

  hideLoading();
}

/**
 * @description Password mode: Show email + password sign in form.
 */
export function renderPasswordSignInView() {
  textElement.textContent = 'Enter your email and password to sign in.';
  encryptionForm.style.display = 'none';
  authPasswordGroup.style.display = 'block';
  authPasswordConfirmGroup.style.display = 'none';
  authToggle.style.display = 'none';
  loginButton.textContent = 'Sign In';

  hideLoading();
}

/**
 * @description Password mode: Show "Set your password" form for invite flow.
 */
export function renderPasswordSetupView(email) {
  textElement.textContent = 'Set your password to complete registration.';
  emailForm.style.display = 'none';
  emailInput.value = email;
  encryptionForm.style.display = 'none';
  authPasswordGroup.style.display = 'block';
  authPasswordConfirmGroup.style.display = 'block';
  authToggle.style.display = 'none';
  loginButton.textContent = 'Set Password';

  hideLoading();
}

/**
 * @description Password mode: Show email + password + confirm for registration.
 */
export function renderPasswordRegisterView() {
  textElement.textContent = 'Create your account.';
  emailForm.style.display = 'block';
  encryptionForm.style.display = 'none';
  authPasswordGroup.style.display = 'block';
  authPasswordConfirmGroup.style.display = 'block';
  authToggle.style.display = 'block';
  authToggleLink.textContent = 'Already have an account? Sign In';
  loginButton.textContent = 'Create Account';

  hideLoading();
}

/**
 * @description Magic link sign in: Success screen.
 */
export async function renderNewMagicLink(email) {
  const { apiRequest } = await import('./api.mjs');
  const response = await apiRequest('/auth/login', 'POST', { email });

  document.querySelector('.auth-form').style.display = 'none';
  const magicLinkForm = document.getElementById('magic-link-sent-form');
  const magicLinkMessage = document.getElementById('magic-link-sent-message');

  magicLinkMessage.textContent =
    response.message ||
    `Magic link sent to ${email}. Please check your inbox and click the link to continue.`;

  magicLinkForm.style.display = 'block';
}

/**
 * @description Renders the signed-in application shell.
 */
export async function showAppScreen() {
  const { loadServerName } = await import('./settings.mjs');
  const { loadChannels, restoreLastChannel } = await import('./channels.mjs');
  const { loadConversations } = await import('./conversations.mjs');

  state.currentUser = await getUserInfo();
  if (!state.currentUser) {
    hideLoading();
    return;
  }

  window.history.replaceState({}, document.title, window.location.pathname);

  await loadServerName();
  await loadChannels();
  await loadConversations();

  userAvatar.textContent = getInitials(state.currentUser.userName);
  userName.textContent = state.currentUser.userName;

  authContainer.style.display = 'none';
  appContainer.style.display = 'flex';

  await restoreLastChannel();

  const savedTheme = (await state.storage.getItem('darkMode')) !== 'false';
  await setTheme(savedTheme);

  hideLoading();
}

//////////////
// ELEMENTS //
//////////////

/**
 * @description Render an individual channel item in the sidebar.
 */
export async function renderChannelItem(channel) {
  const { selectChannel } = await import('./channels.mjs');

  let channelItem = document.querySelector(
    `.channel-item[data-id="${channel.id}"]`
  );

  if (!channelItem) {
    channelItem = document.createElement('div');
    channelItem.className = 'channel-item';
    channelItem.dataset.id = channel.id;
    channelItem.addEventListener(
      'click',
      async () => await selectChannel(channel.id, channel.name)
    );
    channelsList.appendChild(channelItem);
  }

  const unreadCount = state.unreadCounts.get(channel.id) || 0;

  channelItem.innerHTML = '';

  // Add channel name
  const channelContent = document.createElement('div');
  channelContent.textContent = channel.name;
  channelContent.className = 'channel-name';
  channelItem.appendChild(channelContent);

  // Add notification indicator if there are unread messages
  if (unreadCount > 0) {
    const notificationBadge = document.createElement('div');
    notificationBadge.className = 'notification-badge';
    notificationBadge.textContent = unreadCount > 99 ? '99+' : unreadCount;
    channelItem.appendChild(notificationBadge);
  }

  // Add settings icon for channel options
  if (channel.createdBy === state.currentUser.id) {
    const settingsButton = document.createElement('div');
    settingsButton.className = 'channel-settings';
    settingsButton.innerHTML = '⚙️';
    settingsButton.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditChannelModal(channel);
    });
    channelItem.appendChild(settingsButton);
  }

  // Set active state
  if (channel.id === state.currentChannelId) channelItem.classList.add('active');
  else channelItem.classList.remove('active');
}

/**
 * @description Update the user interface to correctly reflect the pending image uploads.
 */
export function updatePendingUploadsUI() {
  const { removePendingUpload } = import('./images.mjs');

  const container = document.getElementById('pending-uploads-container');
  const uploadsContainer = document.getElementById('pending-uploads');

  if (state.pendingUploads.length === 0) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';
  uploadsContainer.innerHTML = '';

  state.pendingUploads.forEach((upload, index) => {
    const uploadDiv = document.createElement('div');
    uploadDiv.className = 'pending-upload';
    uploadDiv.innerHTML = `
      <img src="${upload.preview}" alt="Upload preview">
      <div class="remove-upload" data-index="${index}">&times;</div>
    `;
    uploadsContainer.appendChild(uploadDiv);
  });

  const removeButtons = document.querySelectorAll('.remove-upload');
  removeButtons.forEach((button) => {
    button.addEventListener('click', async (e) => {
      const { removePendingUpload } = await import('./images.mjs');
      const index = Number.parseInt(e.target.dataset.index);
      removePendingUpload(index);
    });
  });
}

/**
 * @description Render a new reaction to the user interface.
 * There are dedicated functions for updating reactions and their values.
 */
export async function renderReaction(messageId, reaction, count, userReacted) {
  const { addReaction, removeReaction } = await import('./reactions.mjs');
  const reactionsContainer = getReactionsContainer(messageId);
  if (!reactionsContainer) return;

  const reactionElement = document.createElement('div');
  reactionElement.className = `reaction ${userReacted ? 'user-reacted' : ''}`;
  reactionElement.dataset.reaction = reaction;
  reactionElement.dataset.messageId = messageId;
  reactionElement.innerHTML = `
        <span class="reaction-reaction">${reaction}</span>
        <span class="reaction-count">${count}</span>
      `;

  // Add event listener
  reactionElement.addEventListener('click', async () => {
    // Helper function so we can dynamically assess the state, even when changed by others
    if (isReacted(reactionElement)) await removeReaction(messageId, reaction);
    else await addReaction(messageId, reaction);
  });

  reactionsContainer.appendChild(reactionElement);

  return reactionElement;
}

/**
 * @description Get the number of reactions for a specific emoji.
 */
export function getReactionCount(reaction) {
  if (!reaction) return 0;
  const element = reaction.querySelector('.reaction-count');
  if (element) return Number.parseInt(element.textContent, 10) || 0;
}

/**
 * @description Update the number of reactions for a specific emoji.
 */
export function updateReactionCount(reaction, count) {
  if (!reaction) return;
  const element = reaction.querySelector('.reaction-count');
  if (element) element.textContent = count.toString();
}

/**
 * @description Toggle a reaction (emoji) between being reacted to or not.
 */
export function reacted(element, userReacted) {
  if (!element) return;
  element.className = `reaction ${userReacted ? 'user-reacted' : ''}`;
}

/**
 * @description Checks if the user has reacted to a specific emoji.
 */
export function isReacted(element) {
  if (!element) return;
  return Array.from(element.classList).includes('user-reacted');
}

////////////////
// GENERAL UI //
////////////////

/**
 * @description Shows a "toast" information popup.
 */
export function showToast(message, type = 'success') {
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

/**
 * @description Scroll the messages area to the bottom.
 */
export function scrollToBottom() {
  const messagesAreaEl = document.getElementById('messages-area');
  if (messagesAreaEl) {
    messagesAreaEl.scrollTop = 0; // Due to flex-direction: column-reverse
  }
}

/////////////
// LOADING //
/////////////

export function showLoading() {
  loading.style.display = 'flex';
}

export function hideLoading() {
  loading.style.display = 'none';
}

////////////
// MODALS //
////////////

export function openCreateChannelModal() {
  createChannelModal.classList.add('active');
  channelNameInput.focus();
}

export function closeCreateChannelModal() {
  createChannelModal.classList.remove('active');
  channelNameInput.value = '';
}

export function openReactionPicker(messageId) {
  state.currentMessageForReaction = messageId;
  reactionPickerModal.classList.add('active');
}

export function closeReactionPicker() {
  reactionPickerModal.classList.remove('active');
  state.currentMessageForReaction = null;
}

export function openEditModal(message) {
  state.currentMessageForEdit = message.id;
  editMessageInput.value = message.content;
  editMessageModal.classList.add('active');
  editMessageInput.focus();
}

export function closeEditModal() {
  editMessageModal.classList.remove('active');
  editMessageInput.value = '';
  state.currentMessageForEdit = null;
}

export function openEditChannelModal(channel) {
  state.currentChannelForEdit = channel;
  editChannelNameInput.value = channel.name;
  editChannelModal.classList.add('active');
  editChannelNameInput.focus();
}

export function closeEditChannelModal() {
  editChannelModal.classList.remove('active');
  editChannelNameInput.value = '';
  state.currentChannelForEdit = null;
}

export function closeAllModals() {
  const activeModals = document.querySelectorAll('.modal-backdrop.active');

  activeModals.forEach((modal) => modal.classList.remove('active'));

  state.currentMessageForReaction = null;
  state.currentMessageForEdit = null;
  state.currentChannelForEdit = null;
}

///////////////////////////
// DOCUMENT TITLE BADGE  //
///////////////////////////

/**
 * @description Update the browser tab title with total unread count.
 */
export function updateDocumentTitle() {
  let total = 0;
  for (const count of state.unreadCounts.values()) total += count;
  for (const count of state.dmUnreadCounts.values()) total += count;

  document.title = total > 0 ? `(${total}) MikroChat` : 'MikroChat';
}

///////////////////////////
// DESKTOP NOTIFICATIONS //
///////////////////////////

/**
 * @description Request permission for desktop notifications.
 */
export function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

/**
 * @description Show a desktop notification when the tab is not focused.
 */
export function showDesktopNotification(title, body) {
  if (
    !('Notification' in window) ||
    Notification.permission !== 'granted' ||
    document.hasFocus()
  )
    return;

  const notification = new Notification(title, {
    body,
    icon: '/icons/icon-192.png'
  });

  notification.onclick = () => {
    window.focus();
    notification.close();
  };
}
