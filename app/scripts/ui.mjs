/////////////
// SCREENS //
/////////////

/**
 * @description Handles the rendering of the auth screen.
 */
async function showAuthScreen() {
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
}

/**
 * @description Sign in user with magic link URL parameters.
 */
function signInWithMagicLink() {
  const { emailParam } = getUrlParams();
  emailInput.value = emailParam;
  loginButton.click();
}

/**
 * @description Dev mode sign in: Only show email input.
 */
function renderDevModePlainSignInView() {
  textElement.textContent = 'Enter your email to sign in.';
  encryptionForm.style.display = 'none';

  hideLoading();
}

/**
 * @description Dev mode sign in: Show both email and encryption key inputs.
 */
function renderDevModeEncryptionSignInView() {
  textElement.textContent = 'Enter your email and encryption key to sign in.';
  encryptionForm.style.display = 'block';

  hideLoading();
}

/**
 * @description Magic link sign in: Show encryption input and only show email input
 * if the user is not on a magic link URL path.
 */
function renderMagicLinkEncryptionSignInView() {
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
function renderMagicLinkUnauthenticatedView() {
  textElement.textContent = 'Enter your email to get a magic link.';
  encryptionForm.style.display = 'none';

  hideLoading();
}

/**
 * @description Magic link sign in: Success screen.
 */
async function renderNewMagicLink(email) {
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
async function showAppScreen() {
  currentUser = await getUserInfo();
  if (!currentUser) {
    hideLoading();
    return;
  }

  window.history.replaceState({}, document.title, window.location.pathname);

  await loadServerName();
  await loadChannels();

  userAvatar.textContent = getInitials(currentUser.userName);
  userName.textContent = currentUser.userName;

  authContainer.style.display = 'none';
  appContainer.style.display = 'flex';

  await restoreLastChannel();

  const savedTheme = (await storage.getItem('darkMode')) !== 'false';
  await setTheme(savedTheme);

  hideLoading();
}

//////////////
// ELEMENTS //
//////////////

/**
 * @description Render an individual channel item in the sidebar.
 */
async function renderChannelItem(channel) {
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

  const unreadCount = unreadCounts.get(channel.id) || 0;

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
  if (channel.createdBy === currentUser.id) {
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
  if (channel.id === currentChannelId) channelItem.classList.add('active');
  else channelItem.classList.remove('active');
}

/**
 * @description Update the user interface to correctly reflect the pending image uploads.
 */
function updatePendingUploadsUI() {
  const container = document.getElementById('pending-uploads-container');
  const uploadsContainer = document.getElementById('pending-uploads');

  if (pendingUploads.length === 0) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';
  uploadsContainer.innerHTML = '';

  pendingUploads.forEach((upload, index) => {
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
    button.addEventListener('click', (e) => {
      const index = Number.parseInt(e.target.dataset.index);
      removePendingUpload(index);
    });
  });
}

/**
 * @description Render a new reaction to the user interface.
 * There are dedicated functions for updating reactions and their values.
 */
async function renderReaction(messageId, reaction, count, userReacted) {
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
function getReactionCount(reaction) {
  if (!reaction) return 0;
  const element = reaction.querySelector('.reaction-count');
  if (element) return Number.parseInt(element.textContent, 10) || 0;
}

/**
 * @description Update the number of reactions for a specific emoji.
 */
function updateReactionCount(reaction, count) {
  if (!reaction) return;
  const element = reaction.querySelector('.reaction-count');
  if (element) element.textContent = count.toString();
}

/**
 * @description Toggle a reaction (emoji) between being reacted to or not.
 */
function reacted(element, userReacted) {
  if (!element) return;
  element.className = `reaction ${userReacted ? 'user-reacted' : ''}`;
}

/**
 * @description Checks if the user has reacted to a specific emoji.
 */
function isReacted(element) {
  if (!element) return;
  return Array.from(element.classList).includes('user-reacted');
}

////////////////
// GENERAL UI //
////////////////

/**
 * @description Shows a "toast" information popup.
 */
function showToast(message, type = 'success') {
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

/////////////
// LOADING //
/////////////

function showLoading() {
  loading.style.display = 'flex';
}

function hideLoading() {
  loading.style.display = 'none';
}

////////////
// MODALS //
////////////

function openCreateChannelModal() {
  createChannelModal.classList.add('active');
  channelNameInput.focus();
}

function closeCreateChannelModal() {
  createChannelModal.classList.remove('active');
  channelNameInput.value = '';
}

function openReactionPicker(messageId) {
  currentMessageForReaction = messageId;
  reactionPickerModal.classList.add('active');
}

function closeReactionPicker() {
  reactionPickerModal.classList.remove('active');
  currentMessageForReaction = null;
}

function openEditModal(message) {
  currentMessageForEdit = message.id;
  editMessageInput.value = message.content;
  editMessageModal.classList.add('active');
  editMessageInput.focus();
}

function closeEditModal() {
  editMessageModal.classList.remove('active');
  editMessageInput.value = '';
  currentMessageForEdit = null;
}

function openEditChannelModal(channel) {
  currentChannelForEdit = channel;
  editChannelNameInput.value = channel.name;
  editChannelModal.classList.add('active');
  editChannelNameInput.focus();
}

function closeEditChannelModal() {
  editChannelModal.classList.remove('active');
  editChannelNameInput.value = '';
  currentChannelForEdit = null;
}

function closeAllModals() {
  const activeModals = document.querySelectorAll('.modal-backdrop.active');

  activeModals.forEach((modal) => modal.classList.remove('active'));

  currentMessageForReaction = null;
  currentMessageForEdit = null;
  currentChannelForEdit = null;
}
