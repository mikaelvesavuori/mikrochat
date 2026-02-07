// App state
// biome-ignore lint/style/useConst: Needs to be globally mutable
export let currentChannelForEdit = null;
// biome-ignore lint/style/useConst: Needs to be globally mutable
export let currentUser = null;
// biome-ignore lint/style/useConst: Needs to be globally mutable
export let currentChannelId = null;
// biome-ignore lint/style/useConst: Needs to be globally mutable
export let messageEventSource = null;
// biome-ignore lint/style/useConst: Needs to be globally mutable
export let currentMessageForReaction = null;
// biome-ignore lint/style/useConst: Needs to be globally mutable
export let currentMessageForEdit = null;
// biome-ignore lint/style/useConst: Needs to be globally mutable
export let isStorageInitialized = false;
// biome-ignore lint/style/useConst: Needs to be globally mutable
export let pendingUploads = [];
// biome-ignore lint/style/useConst: Needs to be globally mutable
export let tempIdMap = new Map();
// biome-ignore lint/style/useConst: Needs to be globally mutable
export let messageCache = new Map();
// biome-ignore lint/style/useConst: Needs to be globally mutable
export let unreadCounts = new Map();

// Storage using MikroSafe
// biome-ignore lint/style/useConst: Needs to be mutable since we set it later
export let storage = null;

// Global DOM element references
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
export const themeSwitchIcon = themeSwitch.querySelector('.theme-switch-icon');
export const themeSwitchLabel = themeSwitch.querySelector(
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
