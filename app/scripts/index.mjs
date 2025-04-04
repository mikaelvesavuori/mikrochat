// App state
// biome-ignore lint/style/useConst: Needs to be globally mutable
let currentChannelForEdit = null;
// biome-ignore lint/style/useConst: Needs to be globally mutable
let currentUser = null;
// biome-ignore lint/style/useConst: Needs to be globally mutable
let currentChannelId = null;
// biome-ignore lint/style/useConst: Needs to be globally mutable
let messageEventSource = null;
// biome-ignore lint/style/useConst: Needs to be globally mutable
let currentMessageForReaction = null;
// biome-ignore lint/style/useConst: Needs to be globally mutable
let currentMessageForEdit = null;
// biome-ignore lint/style/useConst: Needs to be globally mutable
let isStorageInitialized = false;
// biome-ignore lint/style/useConst: Needs to be globally mutable
let pendingUploads = [];
// biome-ignore lint/style/useConst: Needs to be globally mutable
let tempIdMap = new Map();
// biome-ignore lint/style/useConst: Needs to be globally mutable
let messageCache = new Map();
// biome-ignore lint/style/useConst: Needs to be globally mutable
let unreadCounts = new Map();

// Storage using MikroSafe
// biome-ignore lint/style/useConst: Needs to be mutable since we set it later
let storage = null;

// Global DOM element references
const addEmailInput = document.getElementById('add-email-input');
const addUserButton = document.getElementById('add-user-btn');
const addChannelButton = document.getElementById('add-channel-btn');
const appContainer = document.getElementById('app-container');
const authContainer = document.getElementById('auth-container');
const channelNameInput = document.getElementById('channel-name');
const channelsList = document.getElementById('channels-list');
const closeChannelModal = document.getElementById('close-channel-modal');
const closeEditChannelModalEl = document.getElementById(
  'close-edit-channel-modal'
);
const closeEditModalEl = document.getElementById('close-edit-modal');
const closeReactionModal = document.getElementById('close-reaction-modal');
const closeImagePreview = document.getElementById('close-image-preview');
const closeServerSettingsModal = document.getElementById(
  'close-server-settings-modal'
);
const createChannelModal = document.getElementById('create-channel-modal');
const createChannelSubmit = document.getElementById('create-channel-submit');
const currentChannelName = document.getElementById('current-channel-name');
const deleteChannelButton = document.getElementById('delete-channel-btn');
const editChannelModal = document.getElementById('edit-channel-modal');
const editChannelNameInput = document.getElementById('edit-channel-name');
const editMessageInput = document.getElementById('edit-message-input');
const editMessageModal = document.getElementById('edit-message-modal');
const editMessageSubmit = document.getElementById('edit-message-submit');
const emailForm = document.getElementById('auth-form-email');
const emailInput = document.getElementById('auth-email');
const reactionPicker = document.getElementById('reaction-picker');
const reactionPickerModal = document.getElementById('reaction-picker-modal');
const encryptionForm = document.getElementById('auth-form-encryption');
const encryptionPasswordInput = document.getElementById('encryption-password');
const exitServerButton = document.getElementById('exit-server-btn');
const imagePreviewModal = document.getElementById('image-preview-modal');
const imageUpload = document.getElementById('image-upload');
const loading = document.getElementById('loading');
const loginButton = document.getElementById('login-btn');
const logoutButton = document.getElementById('logout-btn');
const menuToggle = document.getElementById('menu-toggle');
const messageInput = document.getElementById('message-input');
const messagesArea = document.getElementById('messages-area');
const passwordInput = document.getElementById('password');
const previewImage = document.getElementById('preview-image');
const sendButton = document.getElementById('send-button');
const serverName = document.getElementById('server-name');
const serverNameInput = document.getElementById('server-name-input');
const serverNameText = document.querySelector('.server-name-text');
const serverSettingsModal = document.getElementById('server-settings-modal');
const sidebar = document.getElementById('sidebar');
const textElement = document.getElementById('auth-form-text');
const themeSwitch = document.getElementById('theme-switch');
const themeSwitchIcon = themeSwitch.querySelector('.theme-switch-icon');
const themeSwitchLabel = themeSwitch.querySelector('.theme-switch-label');
const toast = document.getElementById('toast');
const updateChannelSubmit = document.getElementById('update-channel-submit');
const updateServerNameButton = document.getElementById(
  'update-server-name-btn'
);
const userAvatar = document.getElementById('user-avatar');
const userDropdown = document.getElementById('user-dropdown');
const userMenu = document.getElementById('user-menu');
const usersList = document.getElementById('users-list');
const userName = document.getElementById('user-name');
