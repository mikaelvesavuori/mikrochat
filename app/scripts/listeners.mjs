/**
 * @description Consolidated event listeners for MikroChat.
 * This module sets up all DOM event listeners in one place.
 */

import { state } from './state.mjs';
import {
  addEmailInput,
  addUserButton,
  addChannelButton,
  authForgotPasswordLink,
  channelNameInput,
  closeChannelModal,
  closeEditChannelModalEl,
  closeEditModalEl,
  closeReactionModal,
  closeImagePreview,
  closeServerSettingsModal,
  createChannelSubmit,
  deleteChannelButton,
  editChannelNameInput,
  editMessageInput,
  editMessageSubmit,
  emailInput,
  encryptionPasswordInput,
  exitServerButton,
  imagePreviewModal,
  imageUpload,
  loginButton,
  logoutButton,
  menuToggle,
  messageInput,
  messagesArea,
  reactionPicker,
  sendButton,
  serverName,
  serverNameInput,
  sidebar,
  themeSwitch,
  updateChannelSubmit,
  updateServerNameButton,
  userDropdown,
  userMenu,
  previewImage,
  startDmButton,
  closeStartDmModal,
  addWebhookButton,
  webhookNameInput,
  webhookChannelSelect
} from './dom.mjs';

import { signin, signout } from './auth.mjs';
import { sendMessage, updateMessage } from './messages.mjs';
import {
  createChannel,
  deleteChannel,
  updateChannelName,
  selectChannel
} from './channels.mjs';
import { addReaction, removeReaction } from './reactions.mjs';
import { handleAddImages, openImagePreview } from './images.mjs';
import { setTheme } from './theme.mjs';
import { handleStart } from './start.mjs';
import { setupMessageEvents } from './events.mjs';
import { addUser } from './users.mjs';
import {
  openServerSettingsModal,
  hideServerSettingsModal,
  updateServerName
} from './settings.mjs';
import {
  closeAllModals,
  closeCreateChannelModal,
  closeEditChannelModal,
  closeEditModal,
  closeReactionPicker,
  openCreateChannelModal,
  openEditModal,
  openReactionPicker
} from './ui.mjs';
import { apiRequest } from './api.mjs';
import { openStartDmModal, closeStartDmModalFn } from './conversations.mjs';
import { deleteDMMessage, updateDMMessage } from './dmMessages.mjs';
import { hasUserReactedWithEmoji } from './utils.mjs';

/**
 * @description Initialize all event listeners
 */
export function initializeListeners() {
  // Make openImagePreview available globally for onclick handlers in dynamic HTML
  window.openImagePreview = openImagePreview;

  // Window events
  window.addEventListener('online', async () => {
    if (state.currentChannelId)
      await setupMessageEvents(state.currentChannelId);
  });

  window.addEventListener('DOMContentLoaded', async () => {
    await handleStart();
  });

  // Document events
  document.addEventListener('click', () => {
    userDropdown.classList.remove('show');
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeAllModals();
  });

  document.addEventListener('keydown', (event) => {
    if (
      event.key === 'Escape' &&
      imagePreviewModal.classList.contains('active')
    ) {
      imagePreviewModal.classList.remove('active');
    }
  });

  document.addEventListener('click', (event) => {
    if (
      window.innerWidth <= 768 &&
      sidebar.classList.contains('open') &&
      !event.target.closest('.sidebar') &&
      !event.target.closest('.menu-toggle')
    ) {
      sidebar.classList.remove('open');
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      if (state.messageEventSource) {
        state.messageEventSource.close();
        state.messageEventSource = null;
      }
    } else if (document.visibilityState === 'visible') {
      if (!state.messageEventSource && state.currentChannelId) {
        setupMessageEvents(state.currentChannelId);
      }
    }
  });

  // Auth listeners
  loginButton?.addEventListener('click', () => {
    const email = emailInput.value.trim();
    const encryptionPassword = encryptionPasswordInput
      ? encryptionPasswordInput.value?.trim()
      : null;
    signin(email, encryptionPassword);
  });

  logoutButton?.addEventListener('click', () => signout());

  authForgotPasswordLink?.addEventListener('click', async (event) => {
    event.preventDefault();
    const { renderForgotPasswordView } = await import('./ui.mjs');
    renderForgotPasswordView();
  });

  emailInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      loginButton.click();
    }
  });

  encryptionPasswordInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      loginButton.click();
    }
  });

  // Message listeners
  sendButton?.addEventListener('click', () => {
    const content = messageInput.value;
    sendMessage(content);
  });

  messageInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendButton.click();
    }
  });

  // Channel listeners
  addChannelButton?.addEventListener('click', () => openCreateChannelModal());

  createChannelSubmit?.addEventListener('click', async () => {
    const name = channelNameInput.value.trim();
    if (name) {
      await createChannel(name);
      closeCreateChannelModal();
    }
  });

  channelNameInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      createChannelSubmit.click();
    }
  });

  closeChannelModal?.addEventListener('click', () => closeCreateChannelModal());

  deleteChannelButton?.addEventListener('click', async () => {
    if (
      state.currentChannelForEdit &&
      confirm('Are you sure you want to delete this channel?')
    ) {
      await deleteChannel(state.currentChannelForEdit.id);
      closeEditChannelModal();
    }
  });

  updateChannelSubmit?.addEventListener('click', async () => {
    const newName = editChannelNameInput.value.trim();
    if (newName && state.currentChannelForEdit) {
      await updateChannelName(state.currentChannelForEdit.id, newName);
      closeEditChannelModal();
    }
  });

  editChannelNameInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      updateChannelSubmit.click();
    }
  });

  closeEditChannelModalEl?.addEventListener('click', () =>
    closeEditChannelModal()
  );

  // Edit message listeners
  editMessageSubmit?.addEventListener('click', async () => {
    const content = editMessageInput.value.trim();
    if (content && state.currentMessageForEdit) {
      if (state.currentMessageForEditIsThread) {
        const { updateThreadReply } = await import('./threads.mjs');
        await updateThreadReply(state.currentMessageForEdit, content);
        state.currentMessageForEditIsThread = false;
      } else if (state.currentMessageForEditIsDM) {
        await updateDMMessage(
          state.currentMessageForEdit,
          content,
          state.currentMessageForEditImages || []
        );
        state.currentMessageForEditIsDM = false;
        state.currentMessageForEditImages = [];
      } else {
        await updateMessage(state.currentMessageForEdit, content);
      }
      closeEditModal();
    }
  });

  editMessageInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      editMessageSubmit.click();
    }
  });

  closeEditModalEl?.addEventListener('click', () => closeEditModal());

  // Reaction listeners
  reactionPicker?.addEventListener('click', async (event) => {
    const item = event.target.closest('.reaction-item');
    if (item && state.currentMessageForReaction) {
      const reaction = item.dataset.reaction;
      await addReaction(state.currentMessageForReaction, reaction);
    }
  });

  closeReactionModal?.addEventListener('click', () => closeReactionPicker());

  // Image listeners
  imageUpload?.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleAddImages(e.target.files);
      e.target.value = '';
    }
  });

  closeImagePreview?.addEventListener('click', () => {
    imagePreviewModal.classList.remove('active');
    const objectUrl = previewImage.getAttribute('data-object-url');
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      previewImage.removeAttribute('data-object-url');
    }
  });

  // Messages area listeners (drag & drop, channel links)
  messagesArea?.addEventListener('dragover', (e) => {
    e.preventDefault();
    messagesArea.classList.add('drag-over');
  });

  messagesArea?.addEventListener('dragleave', () => {
    messagesArea.classList.remove('drag-over');
  });

  messagesArea?.addEventListener('drop', (e) => {
    e.preventDefault();
    messagesArea.classList.remove('drag-over');
    if (e.dataTransfer.files.length > 0) handleAddImages(e.dataTransfer.files);
  });

  messagesArea?.addEventListener('click', async (event) => {
    const channelLink = event.target.closest('.channel-link');
    if (channelLink) {
      event.preventDefault();
      const channelId = channelLink.dataset.channelId;
      const channelName = channelLink.dataset.channelName;
      if (channelId) await selectChannel(channelId, channelName);
      return;
    }

    // DM message edit button
    const editBtn = event.target.closest('.message-edit[data-is-dm="true"]');
    if (editBtn) {
      const messageId = editBtn.dataset.messageId;
      const messageEl = event.target.closest('.message');
      const content =
        messageEl?.querySelector('.message-text')?.textContent || '';
      const images = [];
      messageEl?.querySelectorAll('.message-image').forEach((img) => {
        if (img.dataset.image) images.push(img.dataset.image);
      });
      state.currentMessageForEdit = messageId;
      state.currentMessageForEditIsDM = true;
      state.currentMessageForEditContent = content;
      state.currentMessageForEditImages = images;
      openEditModal({ id: messageId, content, images });
      return;
    }

    // DM message delete button
    const deleteBtn = event.target.closest(
      '.message-delete[data-is-dm="true"]'
    );
    if (deleteBtn) {
      const messageId = deleteBtn.dataset.messageId;
      if (confirm('Are you sure you want to delete this message?')) {
        await deleteDMMessage(messageId);
      }
      return;
    }

    // DM add reaction button
    const addReactionBtn = event.target.closest(
      '.add-reaction[data-message-id]'
    );
    if (addReactionBtn) {
      const messageId = addReactionBtn.dataset.messageId;
      state.currentMessageForReaction = messageId;
      state.currentMessageForReactionIsDM = true;
      openReactionPicker(messageId);
      return;
    }

    // DM existing reaction click (toggle)
    const reactionEl = event.target.closest('.reaction[data-message-id]');
    if (reactionEl) {
      const messageId = reactionEl.dataset.messageId;
      const emoji = reactionEl.dataset.reaction;
      state.currentMessageForReactionIsDM = true;
      if (hasUserReactedWithEmoji(messageId, emoji)) {
        await removeReaction(messageId, emoji);
      } else {
        await addReaction(messageId, emoji);
      }
      return;
    }

    // DM image removal button
    const removeImageBtn = event.target.closest(
      '.remove-image-btn[data-message-id]'
    );
    if (removeImageBtn) {
      event.stopPropagation();
      const messageId = removeImageBtn.dataset.messageId;
      const imageFilename = removeImageBtn.dataset.image;
      if (confirm('Remove this image?')) {
        const messageEl = event.target.closest('.message');
        const currentImages = [];
        messageEl?.querySelectorAll('.message-image').forEach((img) => {
          if (img.dataset.image && img.dataset.image !== imageFilename) {
            currentImages.push(img.dataset.image);
          }
        });
        const content =
          messageEl?.querySelector('.message-text')?.textContent || '';
        await updateDMMessage(messageId, content, currentImages);
      }
      return;
    }
  });

  // Theme listener
  themeSwitch?.addEventListener('click', async () => {
    const isDarkMode = !document.body.classList.contains('light-mode');
    await setTheme(!isDarkMode);
  });

  // Menu toggle (mobile)
  menuToggle?.addEventListener('click', () => {
    sidebar.classList.toggle('open');
  });

  // User menu
  userMenu?.addEventListener('click', (event) => {
    event.stopPropagation();
    userDropdown.classList.toggle('show');
  });

  // Server settings listeners
  serverName?.addEventListener('click', () => openServerSettingsModal());

  closeServerSettingsModal?.addEventListener('click', () =>
    hideServerSettingsModal()
  );

  updateServerNameButton?.addEventListener('click', async () => {
    const name = serverNameInput.value.trim();
    if (name) await updateServerName(name);
  });

  serverNameInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      updateServerNameButton.click();
    }
  });

  // User management listeners
  addUserButton?.addEventListener('click', async () => {
    const email = addEmailInput.value.trim();
    if (email) {
      await addUser(email, 'user');
      addEmailInput.value = '';
    }
  });

  addEmailInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addUserButton.click();
    }
  });

  exitServerButton?.addEventListener('click', async () => {
    if (confirm('Are you sure you want to leave this server?')) {
      try {
        await apiRequest('/users/exit', 'POST');
        await signout();
      } catch (error) {
        console.error('Error exiting server:', error);
      }
    }
  });

  // Direct Messages listeners
  startDmButton?.addEventListener('click', () => openStartDmModal());
  closeStartDmModal?.addEventListener('click', () => closeStartDmModalFn());

  // Webhook listeners
  addWebhookButton?.addEventListener('click', async () => {
    const name = webhookNameInput?.value?.trim();
    const channelId = webhookChannelSelect?.value;
    if (name && channelId) {
      const { createWebhook } = await import('./webhooks.mjs');
      await createWebhook(name, channelId);
    }
  });
}
