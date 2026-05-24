import { state } from './state.mjs';
import {
  serverName,
  serverNameInput,
  serverSettingsModal,
  serverNameText,
  userAvatar,
  userName,
  userSettingsModal,
  userSettingsNameInput,
  auditActionFilter,
  auditDateFrom,
  auditDateTo,
  auditLimitFilter,
  auditLogList,
  auditNewerButton,
  auditOlderButton,
  auditPageInfo,
  auditPagination
} from './dom.mjs';
import { apiRequest } from './api.mjs';
import { showToast, showLoading, hideLoading } from './ui.mjs';
import { loadUsers } from './users.mjs';
import { getInitials } from './utils.mjs';
import { storage } from './storage.mjs';

const auditState = {
  hasMore: false,
  limit: 25,
  offset: 0,
  total: 0
};

let settingsNavigationBound = false;
let auditControlsBound = false;

function isAdminSettingsView(element) {
  return element?.classList?.contains('admin-only') ?? false;
}

function setAdminSettingsVisibility() {
  const isAdmin = Boolean(state.currentUser?.isAdmin);

  serverSettingsModal.querySelectorAll('.admin-only').forEach((element) => {
    element.hidden = !isAdmin;
    if (element.classList.contains('settings-view'))
      element.style.display = isAdmin ? '' : 'none';
  });
}

function showSettingsView(viewName) {
  const isAdmin = Boolean(state.currentUser?.isAdmin);
  const panels = [...serverSettingsModal.querySelectorAll('.settings-view')];
  const navItems = [...serverSettingsModal.querySelectorAll('.settings-nav-item')];
  const target =
    panels.find((panel) => panel.dataset.settingsView === viewName) ||
    panels.find((panel) => panel.dataset.settingsView === 'general');

  if (!target || (isAdminSettingsView(target) && !isAdmin)) {
    showSettingsView('general');
    return;
  }

  for (const panel of panels) {
    panel.classList.toggle('active', panel === target);
  }

  for (const item of navItems) {
    const isActive = item.dataset.settingsView === target.dataset.settingsView;
    item.classList.toggle('active', isActive);
    item.setAttribute('aria-selected', String(isActive));
  }

  if (target.dataset.settingsView === 'audit') loadAuditLog();
}

function setupSettingsNavigation() {
  if (settingsNavigationBound) return;

  serverSettingsModal.querySelector('.settings-nav')?.addEventListener('click', (event) => {
    const item = event.target.closest('.settings-nav-item');
    if (!item) return;
    showSettingsView(item.dataset.settingsView || 'general');
  });

  settingsNavigationBound = true;
}

/**
 * @description Open the server settings modal.
 */
export function openServerSettingsModal() {
  const updatedServerName = serverName.textContent.trim().replace(/\s+/g, ' ');
  serverNameInput.value = updatedServerName;
  setupSettingsNavigation();
  setupAuditControls();
  setAdminSettingsVisibility();
  showSettingsView('general');
  serverSettingsModal.classList.add('active');
  serverNameInput.focus();
  loadUsers();

  if (state.currentUser?.isAdmin) {
    import('./webhooks.mjs').then(({ loadWebhooks }) => loadWebhooks());
  }
}

/**
 * @description Hide the server settings modal.
 */
export function hideServerSettingsModal() {
  serverSettingsModal.classList.remove('active');
  const tokenDisplay = document.querySelector('.webhook-token-display');
  if (tokenDisplay) tokenDisplay.remove();
}

/**
 * @description Update the server name.
 */
export async function updateServerName(name) {
  try {
    showLoading();

    const response = await apiRequest('/server/settings', 'PUT', { name });

    serverNameText.textContent = name;

    await storage.setItem('serverName', name);

    hideServerSettingsModal();
    showToast('Server name updated successfully');

    hideLoading();
    return response;
  } catch (error) {
    hideLoading();
    showToast(error.message || 'Failed to update server name', 'error');
    throw error;
  }
}

/**
 * @description Get the server name.
 */
export async function loadServerName() {
  try {
    const response = await apiRequest('/server/settings', 'GET');
    if (response?.name) {
      serverNameText.textContent = response.name;
      await storage.setItem('serverName', response.name);
      return;
    }
  } catch (error) {
    console.error('Error loading server name from API:', error);
  }

  const savedName = await storage.getItem('serverName');
  if (savedName) serverNameText.textContent = savedName;
}

/**
 * @description Open the user settings modal.
 */
export function openUserSettingsModal() {
  userSettingsNameInput.value = state.currentUser?.userName || '';
  userSettingsModal.classList.add('active');
  userSettingsNameInput.focus();
}

/**
 * @description Close the user settings modal.
 */
export function closeUserSettingsModal() {
  userSettingsModal.classList.remove('active');
}

/**
 * @description Update the current user's display name.
 */
export async function updateUserName(newName) {
  const trimmed = newName?.trim();
  if (!trimmed) return showToast('Name cannot be empty', 'error');

  try {
    showLoading();
    await apiRequest('/users/me', 'PUT', { userName: trimmed });

    state.currentUser.userName = trimmed;
    userAvatar.textContent = getInitials(trimmed);
    userName.textContent = trimmed;

    closeUserSettingsModal();
    showToast('Display name updated');
    hideLoading();
  } catch (error) {
    hideLoading();
    showToast(error.message || 'Failed to update display name', 'error');
  }
}

export async function exportServerData() {
  try {
    const data = await apiRequest('/admin/export');
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json'
    });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = `mikrochat-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
    showToast('Export created');
  } catch (error) {
    showToast(error.message || 'Failed to export data', 'error');
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatAuditTime(timestamp) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(timestamp));
}

function getAuditActor(actorId) {
  if (!actorId) return 'System';

  const actor = state.userCache.get(actorId);
  if (!actor) return 'Unknown user';

  return actor.userName || actor.email || 'Unknown user';
}

function shortId(id) {
  if (!id) return '';
  return id.length > 12 ? `${id.slice(0, 8)}...` : id;
}

function getAuditCopy(entry) {
  const metadata = entry.metadata || {};
  const email = metadata.email ? String(metadata.email) : '';
  const name = metadata.name ? String(metadata.name) : '';
  const userName = metadata.userName ? String(metadata.userName) : '';
  const isPrivate = metadata.isPrivate === true;
  const isAdmin = metadata.isAdmin === true;

  switch (entry.action) {
    case 'server.settings.update':
      return {
        title: 'Updated server settings',
        description: 'Server configuration changed'
      };
    case 'user.create':
      return {
        title: `Added ${email || 'a user'}`,
        description: `Created as ${isAdmin ? 'admin' : 'user'}`
      };
    case 'user.remove':
      return {
        title: `Removed ${email || 'a user'}`,
        description: 'User access was revoked'
      };
    case 'user.role.update':
      return {
        title: 'Changed user role',
        description: `Made user ${isAdmin ? 'an admin' : 'a regular user'}`
      };
    case 'user.exit':
      return {
        title: 'User left the server',
        description: 'Account exited this MikroChat server'
      };
    case 'user.name.update':
      return {
        title: 'Updated display name',
        description: userName ? `New name: ${userName}` : 'Profile name changed'
      };
    case 'channel.create':
      return {
        title: `Created #${name || 'channel'}`,
        description: isPrivate ? 'Private channel' : 'Public channel'
      };
    case 'channel.update': {
      const details = [isPrivate ? 'Private channel' : 'Public channel'];
      if (typeof metadata.memberCount === 'number')
        details.push(`${metadata.memberCount} member${metadata.memberCount === 1 ? '' : 's'}`);
      return {
        title: `Updated #${name || 'channel'}`,
        description: details.join(' · ')
      };
    }
    case 'channel.delete':
      return {
        title: `Deleted #${name || 'channel'}`,
        description: 'Channel and related messages were removed'
      };
    case 'message.pin':
      return {
        title: 'Pinned a message',
        description: 'Message added to pinned items'
      };
    case 'message.unpin':
      return {
        title: 'Unpinned a message',
        description: 'Message removed from pinned items'
      };
    case 'webhook.create':
      return {
        title: `Created webhook${name ? ` ${name}` : ''}`,
        description: 'Webhook can post into a channel'
      };
    case 'webhook.delete':
      return {
        title: 'Deleted webhook',
        description: 'Webhook access was revoked'
      };
    default:
      return {
        title: entry.action,
        description: 'Audit event recorded'
      };
  }
}

function getAuditChips(entry) {
  const metadata = entry.metadata || {};
  const chips = [`Actor: ${getAuditActor(entry.actorId)}`, `Target: ${entry.targetType}`];

  if (entry.targetId) chips.push(`ID: ${shortId(entry.targetId)}`);
  if (metadata.channelId) chips.push(`Channel: ${shortId(String(metadata.channelId))}`);

  return chips;
}

function renderAuditEntry(entry) {
  const copy = getAuditCopy(entry);
  const time = formatAuditTime(entry.createdAt);
  const targetType = entry.targetType || 'event';
  const initial = targetType.slice(0, 1).toUpperCase();
  const chips = getAuditChips(entry)
    .map((chip) => `<span class="audit-chip">${escapeHtml(chip)}</span>`)
    .join('');

  return `
    <div class="audit-log-item audit-target-${escapeHtml(targetType)}">
      <div class="audit-icon">${escapeHtml(initial)}</div>
      <div class="audit-log-content">
        <div class="audit-log-topline">
          <div class="audit-log-main">
            <div class="audit-action">${escapeHtml(copy.title)}</div>
            <div class="audit-description">${escapeHtml(copy.description)}</div>
          </div>
          <time class="audit-time" datetime="${new Date(entry.createdAt).toISOString()}">${escapeHtml(time)}</time>
        </div>
        <div class="audit-meta">${chips}</div>
      </div>
    </div>
  `;
}

function readAuditLimit() {
  const limit = Number(auditLimitFilter?.value || auditState.limit);
  if (![25, 50, 100].includes(limit)) return 25;
  return limit;
}

function getDateBoundary(value, endOfDay = false) {
  if (!value) return undefined;

  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return undefined;

  return new Date(
    year,
    month - 1,
    day,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0
  ).getTime();
}

function populateAuditActionFilter() {
  if (!auditActionFilter) return;

  const selected = auditActionFilter.value;
  auditActionFilter.replaceChildren(new Option('All events', ''));
  auditActionFilter.append(new Option('Server', 'server'));
  auditActionFilter.append(new Option('User', 'user'));

  if (selected === 'server' || selected === 'user') auditActionFilter.value = selected;
}

function getAuditQuery(options = {}) {
  const limit = readAuditLimit();
  const changedLimit = limit !== auditState.limit;

  if (options.reset || changedLimit) auditState.offset = 0;
  if (typeof options.offset === 'number') auditState.offset = Math.max(0, options.offset);

  auditState.limit = limit;

  const params = new URLSearchParams({
    limit: String(auditState.limit),
    offset: String(auditState.offset)
  });

  const category = auditActionFilter?.value;
  const from = getDateBoundary(auditDateFrom?.value);
  const to = getDateBoundary(auditDateTo?.value, true);

  if (category) params.set('category', category);
  if (typeof from === 'number') params.set('from', String(from));
  if (typeof to === 'number') params.set('to', String(to));

  return params;
}

function renderAuditPagination(entryCount) {
  if (!auditPagination) return;

  const hasPaging = auditState.total > auditState.limit || auditState.offset > 0;
  auditPagination.hidden = !hasPaging;
  if (!hasPaging) return;

  const start = auditState.total === 0 ? 0 : auditState.offset + 1;
  const end = Math.min(auditState.offset + entryCount, auditState.total);

  if (auditPageInfo)
    auditPageInfo.textContent =
      auditState.total === 0 ? 'No matching events' : `${start}-${end} of ${auditState.total}`;

  if (auditNewerButton) auditNewerButton.disabled = auditState.offset === 0;
  if (auditOlderButton) auditOlderButton.disabled = !auditState.hasMore;
}

function setupAuditControls() {
  if (auditControlsBound) return;

  auditActionFilter?.addEventListener('change', () => loadAuditLog({ reset: true }));
  auditDateFrom?.addEventListener('change', () => loadAuditLog({ reset: true }));
  auditDateTo?.addEventListener('change', () => loadAuditLog({ reset: true }));
  auditLimitFilter?.addEventListener('change', () => loadAuditLog({ reset: true }));
  auditNewerButton?.addEventListener('click', () =>
    loadAuditLog({ offset: auditState.offset - auditState.limit })
  );
  auditOlderButton?.addEventListener('click', () =>
    loadAuditLog({ offset: auditState.offset + auditState.limit })
  );

  auditControlsBound = true;
}

export async function loadAuditLog(options = {}) {
  if (!auditLogList) return;

  try {
    const params = getAuditQuery(options);
    auditLogList.innerHTML = '<div class="empty-list">Loading audit events...</div>';
    const response = await apiRequest(`/admin/audit-log?${params.toString()}`);
    const entries = response.entries || [];

    auditState.hasMore = Boolean(response.hasMore);
    auditState.limit = response.limit || auditState.limit;
    auditState.offset = response.offset || 0;
    auditState.total = response.total ?? entries.length;

    populateAuditActionFilter();
    renderAuditPagination(entries.length);

    if (entries.length === 0) {
      auditLogList.innerHTML = '<div class="empty-list">No audit events match these filters</div>';
      return;
    }

    const start = auditState.offset + 1;
    const end = auditState.offset + entries.length;

    auditLogList.innerHTML = `
      <div class="audit-log-summary">Showing ${start}-${end} of ${auditState.total} administrative events</div>
      ${entries.map((entry) => renderAuditEntry(entry)).join('')}
    `;
  } catch (error) {
    showToast(error.message || 'Failed to load audit log', 'error');
  }
}
