import { state } from './state.mjs';
import {
  authContainer,
  appContainer,
  emailInput,
  loginButton,
  textElement,
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
  channelTopicInput,
  channelPrivateInput,
  channelMembersInput,
  reactionPickerModal,
  editMessageInput,
  editMessageModal,
  editChannelNameInput,
  editChannelTopicInput,
  editChannelPrivateInput,
  editChannelMembersInput,
  editChannelModal,
  oauthProviders,
  authDivider,
  authForgotPassword,
  passwordResetSentForm,
  passwordResetSentMessage,
  quotedMessageBar,
  quotedMessageText
} from './dom.mjs';
import { getAuthConfig, getAuthMode, hasEmailConfig, isOAuthEnabled } from './runtime-config.mjs';
import { getUrlParams } from './url.mjs';
import { isMagicLinkUrl } from './magiclink.mjs';
import { getUserInfo, isAuthenticated, signin } from './auth.mjs';
import { getInitials, getReactionsContainer } from './utils.mjs';
import { setTheme } from './theme.mjs';
import { icon, reactionIcon } from './icons.mjs';
import { storage } from './storage.mjs';

/////////////
// SCREENS //
/////////////

/**
 * @description Handles the rendering of the auth screen.
 */
export async function showAuthScreen() {
  closeAllModals();
  resetAuthForm();

  authContainer.style.display = 'grid';
  appContainer.style.display = 'none';

  // Set up OAuth provider buttons (non-blocking)
  setupOAuthProviders();

  const authed = isAuthenticated();
  const authMode = getAuthMode();

  if (authMode === 'dev') {
    if (authed) {
      return await showAppScreen();
    }

    return renderDevModePlainSignInView();
  }

  if (authMode === 'magic-link') {
    if (isMagicLinkUrl()) return signInWithMagicLink();

    if (authed) {
      return await showAppScreen();
    }

    return renderMagicLinkUnauthenticatedView();
  }

  /*
  // Cases for Password Mode
  - On invite URL with email and token parameters -> Display "Set your password" form
  - Already authenticated -> <App screen>
  - Unauthenticated -> Display email + password sign in form
  */
  if (authMode === 'password') {
    const { emailParam, tokenParam, resetParam } = getUrlParams();

    if (emailParam && tokenParam && resetParam) return renderPasswordResetView(emailParam);

    if (emailParam && tokenParam) return renderPasswordSetupView(emailParam);

    if (authed) {
      return await showAppScreen();
    }

    return renderPasswordSignInView();
  }
}

/**
 * @description Fetch and render OAuth provider buttons on the auth screen.
 * Uses server-reported OAuth capability. Non-blocking.
 */
async function setupOAuthProviders() {
  if (!isOAuthEnabled()) {
    oauthProviders.style.display = 'none';
    authDivider.style.display = 'none';
    return;
  }

  try {
    const { fetchOAuthProviders, getProviderIcon, initiateOAuth } = await import('./oauth.mjs');
    const providers = await fetchOAuthProviders();

    if (providers.length === 0) {
      oauthProviders.style.display = 'none';
      authDivider.style.display = 'none';
      return;
    }

    oauthProviders.innerHTML = providers
      .map((provider) => {
        const icon = getProviderIcon(provider.id);
        return `<button type="button" class="btn oauth-btn oauth-btn-${provider.id}" data-provider="${provider.id}">
          ${icon ? `<span class="oauth-btn-icon">${icon}</span>` : ''}
          <span>Sign in with ${provider.name}</span>
        </button>`;
      })
      .join('');

    oauthProviders.style.display = 'grid';
    authDivider.style.display = 'flex';

    oauthProviders.querySelectorAll('.oauth-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        initiateOAuth(btn.dataset.provider);
      });
    });
  } catch (error) {
    console.error('Failed to load OAuth providers:', error);
    oauthProviders.style.display = 'none';
    authDivider.style.display = 'none';
  }
}

/**
 * @description Sign in user with magic link URL parameters.
 */
export async function signInWithMagicLink() {
  const { emailParam } = getUrlParams();
  emailInput.value = emailParam;
  return await signin(emailParam);
}

/**
 * @description Dev mode sign in: Only show email input.
 */
export function renderDevModePlainSignInView() {
  resetAuthForm();
  textElement.textContent = 'Enter your email to sign in.';

  hideLoading();
}

/**
 * @description Magic link sign in: Show only the email input.
 */
export function renderMagicLinkUnauthenticatedView() {
  resetAuthForm();
  textElement.textContent = 'Enter your email to request a sign-in link.';

  hideLoading();
}

/**
 * @description Password mode: Show email + password sign in form.
 */
export function renderPasswordSignInView() {
  resetAuthForm();
  textElement.textContent = 'Enter your email and password to sign in.';
  authPasswordGroup.style.display = 'block';
  authPasswordConfirmGroup.style.display = 'none';
  authToggle.style.display = 'none';
  authForgotPassword.style.display = hasEmailConfig() ? 'block' : 'none';
  setLoginButtonLabel('Sign in');

  hideLoading();
}

/**
 * @description Password mode: Show "Set your password" form for invite flow.
 */
export function renderPasswordSetupView(email) {
  resetAuthForm();
  textElement.textContent = 'Set your password to complete registration.';
  emailForm.style.display = 'none';
  emailInput.value = email;
  authPasswordGroup.style.display = 'block';
  authPasswordConfirmGroup.style.display = 'block';
  authToggle.style.display = 'none';
  setLoginButtonLabel('Set password');

  hideLoading();
}

/**
 * @description Password mode: Show email + password + confirm for registration.
 */
export function renderPasswordRegisterView() {
  resetAuthForm();
  textElement.textContent = 'Create your account.';
  emailForm.style.display = 'block';
  authPasswordGroup.style.display = 'block';
  authPasswordConfirmGroup.style.display = 'block';
  authToggle.style.display = 'block';
  authToggleLink.textContent = 'Already have an account? Sign in';
  setLoginButtonLabel('Create account');

  hideLoading();
}

/**
 * @description Password mode: Show "Forgot password?" screen with email input only.
 */
export function renderForgotPasswordView() {
  resetAuthForm();
  textElement.textContent = 'Enter your email to receive a password reset link.';
  emailForm.style.display = 'block';
  emailInput.value = '';
  authPasswordGroup.style.display = 'none';
  authPasswordConfirmGroup.style.display = 'none';
  authToggle.style.display = 'none';
  authForgotPassword.style.display = 'none';
  setLoginButtonLabel('Send reset link');

  hideLoading();
}

/**
 * @description Password mode: Show "Reset your password" form from a reset link.
 */
export function renderPasswordResetView(email) {
  resetAuthForm();
  textElement.textContent = 'Reset your password.';
  emailForm.style.display = 'none';
  emailInput.value = email;
  authPasswordGroup.style.display = 'block';
  authPasswordConfirmGroup.style.display = 'block';
  authToggle.style.display = 'none';
  authForgotPassword.style.display = 'none';
  setLoginButtonLabel('Reset password');

  hideLoading();
}

/**
 * @description Password mode: Show confirmation after requesting a password reset.
 */
export function renderPasswordResetSent(message) {
  document.querySelector('.auth-form').style.display = 'none';
  passwordResetSentMessage.textContent =
    message || 'If this email can reset a password, you will receive a link shortly.';
  passwordResetSentForm.style.display = 'block';
}

function resetAuthForm() {
  document.querySelectorAll('.auth-form').forEach((form) => {
    form.style.display = 'none';
  });

  const defaultForm = document.getElementById('default-form');
  if (defaultForm) defaultForm.style.display = 'block';

  emailForm.style.display = 'block';
  const emailLabel = emailForm.getElementsByTagName('label')[0];
  if (emailLabel) emailLabel.style.display = '';
  emailInput.style.display = '';
  authPasswordGroup.style.display = 'none';
  authPasswordConfirmGroup.style.display = 'none';
  authToggle.style.display = 'none';
  authForgotPassword.style.display = 'none';
  setLoginButtonLabel(getDefaultAuthButtonLabel());
}

function setLoginButtonLabel(label) {
  const labelElement = loginButton.querySelector('span');
  if (labelElement) {
    labelElement.textContent = label;
    return;
  }

  loginButton.textContent = label;
}

function getDefaultAuthButtonLabel() {
  const authConfig = getAuthConfig();

  if (authConfig.mode === 'magic-link') return 'Request sign-in link';
  if (authConfig.mode === 'password') return 'Sign in';
  return 'Continue';
}

/**
 * @description Magic link sign in: Success screen.
 */
export async function renderNewMagicLink(email) {
  const { apiRequest } = await import('./api.mjs');
  await apiRequest('/auth/login', 'POST', { email });

  document.querySelector('.auth-form').style.display = 'none';
  const magicLinkForm = document.getElementById('magic-link-sent-form');
  const magicLinkMessage = document.getElementById('magic-link-sent-message');

  magicLinkMessage.textContent = 'If this email can sign in, you will receive a link shortly.';

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
  await loadPresence();

  userAvatar.textContent = getInitials(state.currentUser.userName);
  userName.textContent = state.currentUser.userName;

  authContainer.style.display = 'none';
  appContainer.style.display = 'flex';

  await restoreLastChannel();

  const savedTheme = (await storage.getItem('darkMode')) !== 'false';
  await setTheme(savedTheme);

  hideLoading();
}

async function loadPresence() {
  try {
    const { apiRequest } = await import('./api.mjs');
    const response = await apiRequest('/presence');
    state.presence.clear();
    for (const presence of response.presence || []) state.presence.set(presence.userId, presence);
  } catch (error) {
    console.warn('Failed to load presence:', error);
  }
}

//////////////
// ELEMENTS //
//////////////

/**
 * @description Render an individual channel item in the sidebar.
 */
export async function renderChannelItem(channel) {
  const { selectChannel } = await import('./channels.mjs');

  let channelItem = document.querySelector(`.channel-item[data-id="${channel.id}"]`);

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
  channelContent.className = 'channel-name';
  if (channel.topic) channelContent.title = channel.topic;
  if (channel.isPrivate) {
    channelContent.innerHTML = `${icon('lock-closed', 'icon channel-lock-icon')}<span class="channel-name-text"></span>`;
  } else {
    channelContent.innerHTML = '<span class="channel-name-text"></span>';
  }
  channelContent.querySelector('.channel-name-text').textContent = channel.name;
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
    settingsButton.innerHTML = icon('cog-6-tooth');
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
  const container = document.getElementById('pending-uploads-container');
  const uploadsContainer = document.getElementById('pending-uploads');

  if (state.pendingUploads.length === 0 && state.pendingFiles.length === 0) {
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
      <div class="remove-upload" data-index="${index}">${icon('x-mark')}</div>
    `;
    uploadsContainer.appendChild(uploadDiv);
  });

  state.pendingFiles.forEach((upload, index) => {
    const uploadDiv = document.createElement('div');
    uploadDiv.className = 'pending-file';
    uploadDiv.innerHTML = `
      <span class="pending-file-icon">${icon('paper-clip', 'icon file-icon')}</span>
      <span class="pending-file-name">${upload.name}</span>
      <div class="remove-file-upload" data-index="${index}">${icon('x-mark')}</div>
    `;
    uploadsContainer.appendChild(uploadDiv);
  });

  const removeButtons = document.querySelectorAll('.remove-upload');
  removeButtons.forEach((button) => {
    button.addEventListener('click', async (e) => {
      const { removePendingUpload } = await import('./images.mjs');
      const index = Number.parseInt(e.currentTarget.dataset.index, 10);
      removePendingUpload(index);
    });
  });

  const removeFileButtons = document.querySelectorAll('.remove-file-upload');
  removeFileButtons.forEach((button) => {
    button.addEventListener('click', async (e) => {
      const { removePendingFile } = await import('./files.mjs');
      const index = Number.parseInt(e.currentTarget.dataset.index, 10);
      removePendingFile(index);
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
        <span class="reaction-symbol">${reactionIcon(reaction)}</span>
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

export function updateQuotedMessageUI() {
  if (!quotedMessageBar || !quotedMessageText) return;

  if (!state.quotedMessage) {
    quotedMessageBar.style.display = 'none';
    quotedMessageText.textContent = '';
    return;
  }

  const author = state.quotedMessage.author?.userName || 'Someone';
  const content = state.quotedMessage.content || 'Attachment';
  quotedMessageText.textContent = `${author}: ${content}`;
  quotedMessageBar.style.display = 'flex';
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
  if (channelTopicInput) channelTopicInput.value = '';
  if (channelPrivateInput) channelPrivateInput.checked = false;
  if (channelMembersInput) channelMembersInput.value = '';
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
  if (editChannelTopicInput) editChannelTopicInput.value = channel.topic || '';
  if (editChannelPrivateInput) editChannelPrivateInput.checked = channel.isPrivate === true;
  if (editChannelMembersInput)
    editChannelMembersInput.value = (channel.members || [])
      .map((id) => state.userCache.get(id)?.userName || id)
      .join(', ');
  editChannelModal.classList.add('active');
  editChannelNameInput.focus();
}

export function closeEditChannelModal() {
  editChannelModal.classList.remove('active');
  editChannelNameInput.value = '';
  if (editChannelTopicInput) editChannelTopicInput.value = '';
  if (editChannelPrivateInput) editChannelPrivateInput.checked = false;
  if (editChannelMembersInput) editChannelMembersInput.value = '';
  state.currentChannelForEdit = null;
}

export function closeAllModals() {
  const activeModals = document.querySelectorAll('.modal-backdrop.active');

  activeModals.forEach((modal) => {
    modal.classList.remove('active');
  });

  state.currentMessageForReaction = null;
  state.currentMessageForEdit = null;
  state.currentChannelForEdit = null;

  const tokenDisplay = document.querySelector('.webhook-token-display');
  if (tokenDisplay) tokenDisplay.remove();
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
 * @description Show a desktop notification when the tab is not focused.
 * Lazily requests permission on first use.
 */
export async function showDesktopNotification(title, body) {
  if (!('Notification' in window) || document.hasFocus()) return;

  if (Notification.permission === 'default') await Notification.requestPermission();

  if (Notification.permission !== 'granted') return;

  const notification = new Notification(title, {
    body,
    icon: '/app-icon-192.png'
  });

  notification.onclick = () => {
    window.focus();
    notification.close();
  };
}
