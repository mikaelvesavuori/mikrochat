/**
 * @description Centralized DOM element references.
 * These are initialized once and imported by modules that need them.
 */

export const addEmailInput = document.getElementById('add-email-input');
export const addUserButton = document.getElementById('add-user-btn');
export const addChannelButton = document.getElementById('add-channel-btn');
export const appContainer = document.getElementById('app-container');
export const authContainer = document.getElementById('auth-container');
export const channelNameInput = document.getElementById('channel-name');
export const channelsList = document.getElementById('channels-list');
export const closeChannelModal = document.getElementById('close-channel-modal');
export const closeEditChannelModalEl = document.getElementById(
  'close-edit-channel-modal'
);
export const closeEditModalEl = document.getElementById('close-edit-modal');
export const closeReactionModal = document.getElementById(
  'close-reaction-modal'
);
export const closeImagePreview = document.getElementById('close-image-preview');
export const closeServerSettingsModal = document.getElementById(
  'close-server-settings-modal'
);
export const createChannelModal = document.getElementById(
  'create-channel-modal'
);
export const createChannelSubmit = document.getElementById(
  'create-channel-submit'
);
export const currentChannelName = document.getElementById(
  'current-channel-name'
);
export const deleteChannelButton =
  document.getElementById('delete-channel-btn');
export const editChannelModal = document.getElementById('edit-channel-modal');
export const editChannelNameInput =
  document.getElementById('edit-channel-name');
export const editMessageInput = document.getElementById('edit-message-input');
export const editMessageModal = document.getElementById('edit-message-modal');
export const editMessageSubmit = document.getElementById('edit-message-submit');
export const emailForm = document.getElementById('auth-form-email');
export const emailInput = document.getElementById('auth-email');
export const reactionPicker = document.getElementById('reaction-picker');
export const reactionPickerModal = document.getElementById(
  'reaction-picker-modal'
);
export const encryptionForm = document.getElementById('auth-form-encryption');
export const encryptionPasswordInput = document.getElementById(
  'encryption-password'
);
export const exitServerButton = document.getElementById('exit-server-btn');
export const imagePreviewModal = document.getElementById('image-preview-modal');
export const imageUpload = document.getElementById('image-upload');
export const loading = document.getElementById('loading');
export const loginButton = document.getElementById('login-btn');
export const logoutButton = document.getElementById('logout-btn');
export const menuToggle = document.getElementById('menu-toggle');
export const messageInput = document.getElementById('message-input');
export const messagesArea = document.getElementById('messages-area');
export const passwordInput = document.getElementById('password');
export const previewImage = document.getElementById('preview-image');
export const sendButton = document.getElementById('send-button');
export const serverName = document.getElementById('server-name');
export const serverNameInput = document.getElementById('server-name-input');
export const serverNameText = document.querySelector('.server-name-text');
export const serverSettingsModal = document.getElementById(
  'server-settings-modal'
);
export const sidebar = document.getElementById('sidebar');
export const textElement = document.getElementById('auth-form-text');
export const themeSwitch = document.getElementById('theme-switch');
export const themeSwitchIcon = themeSwitch?.querySelector('.theme-switch-icon');
export const themeSwitchLabel = themeSwitch?.querySelector(
  '.theme-switch-label'
);
export const toast = document.getElementById('toast');
export const updateChannelSubmit = document.getElementById(
  'update-channel-submit'
);
export const updateServerNameButton = document.getElementById(
  'update-server-name-btn'
);
export const userAvatar = document.getElementById('user-avatar');
export const userDropdown = document.getElementById('user-dropdown');
export const userMenu = document.getElementById('user-menu');
export const usersList = document.getElementById('users-list');
export const userName = document.getElementById('user-name');
export const userSettingsButton = document.getElementById('user-settings-btn');
export const userSettingsModal = document.getElementById('user-settings-modal');
export const userSettingsNameInput =
  document.getElementById('user-settings-name');
export const userSettingsSaveBtn = document.getElementById(
  'user-settings-save-btn'
);
export const closeUserSettingsBtn = document.getElementById(
  'close-user-settings-btn'
);

// Password auth elements
export const authPasswordInput = document.getElementById('auth-password');
export const authPasswordConfirmGroup = document.getElementById(
  'auth-form-password-confirm'
);
export const authPasswordConfirmInput = document.getElementById(
  'auth-password-confirm'
);
export const authPasswordGroup = document.getElementById('auth-form-password');
export const authToggle = document.getElementById('auth-toggle');
export const authToggleLink = document.getElementById('auth-toggle-link');

// Direct Messages elements
export const dmList = document.getElementById('dm-list');
export const startDmButton = document.getElementById('start-dm-btn');
export const startDmModal = document.getElementById('start-dm-modal');
export const closeStartDmModal = document.getElementById(
  'close-start-dm-modal'
);
export const dmUserList = document.getElementById('dm-user-list');

// Password reset elements
export const authForgotPassword = document.getElementById(
  'auth-forgot-password'
);
export const authForgotPasswordLink = document.getElementById(
  'auth-forgot-password-link'
);
export const passwordResetSentForm = document.getElementById(
  'password-reset-sent-form'
);
export const passwordResetSentMessage = document.getElementById(
  'password-reset-sent-message'
);

// OAuth elements
export const oauthProviders = document.getElementById('oauth-providers');
export const authDivider = document.getElementById('auth-divider');

// Webhook elements
export const addWebhookButton = document.getElementById('add-webhook-btn');
export const webhookNameInput = document.getElementById('webhook-name-input');
export const webhookChannelSelect = document.getElementById(
  'webhook-channel-select'
);
export const webhooksList = document.getElementById('webhooks-list');
