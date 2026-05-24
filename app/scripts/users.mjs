import { state } from './state.mjs';
import { usersList, addUserPasswordGroup } from './dom.mjs';
import { apiRequest } from './api.mjs';
import { showToast, showLoading, hideLoading } from './ui.mjs';
import { getInitials, formatTime } from './utils.mjs';
import { getAuthMode, hasEmailConfig } from './runtime-config.mjs';
import { icon } from './icons.mjs';

/**
 * @description Get all users on the server.
 */
export async function loadUsers() {
  try {
    const showPasswordControls = getAuthMode() === 'password' && !hasEmailConfig();
    if (showPasswordControls && addUserPasswordGroup) addUserPasswordGroup.style.display = 'block';
    const canManageUsers = state.currentUser?.isAdmin === true;
    const addUserForm = document.querySelector('.add-user-form');
    if (addUserForm) addUserForm.style.display = canManageUsers ? '' : 'none';

    const response = await apiRequest('/users', 'GET');
    usersList.innerHTML = '';
    state.userCache.clear();
    for (const user of response.users || []) state.userCache.set(user.id, user);

    if (response.users && response.users.length > 0) {
      const sortedUsers = [...response.users].sort((a, b) => {
        if (a.id === state.currentUser.id) return -1;
        if (b.id === state.currentUser.id) return 1;
        return 0;
      });

      for (const user of sortedUsers) {
        const userItem = document.createElement('div');
        userItem.className = 'user-item';
        userItem.dataset.id = user.id;

        const isOtherUser = user.id !== state.currentUser.id;

        userItem.innerHTML = `
          <div class="user-avatar">${getInitials(user.userName || user.email.split('@')[0])}</div>
          <div class="user-info">
            <div class="user-email">${user.email}</div>
            <div class="role-badge ${user.isAdmin ? 'admin-role' : 'regular-role'}">${user.isAdmin ? 'Admin' : 'User'}</div>
            <div class="user-created">Added ${formatTime(new Date(user.createdAt))}</div>
          </div>
          ${
            isOtherUser && canManageUsers
              ? `
            <div class="user-actions">
              <button class="toggle-role-user" title="${user.isAdmin ? 'Make User' : 'Make Admin'}">${user.isAdmin ? 'Make User' : 'Make Admin'}</button>
              ${showPasswordControls ? `<button class="reset-password-user" title="Reset Password">${icon('arrow-path')}</button>` : ''}
              <button class="remove-user" title="Remove User">${icon('x-mark')}</button>
            </div>
          `
              : ''
          }
        `;

        const roleButton = userItem.querySelector('.toggle-role-user');
        if (roleButton) {
          roleButton.addEventListener('click', () =>
            updateUserRole(user.id, user.email, user.isAdmin ? 'user' : 'admin')
          );
        }

        const removeButton = userItem.querySelector('.remove-user');
        if (removeButton) {
          removeButton.addEventListener('click', () => removeUser(user.id, user.email));
        }

        const resetButton = userItem.querySelector('.reset-password-user');
        if (resetButton) {
          resetButton.addEventListener('click', () => resetUserPassword(user.id, user.email));
        }

        usersList.appendChild(userItem);
      }
    } else {
      usersList.innerHTML = '<div class="empty-list">No users added yet</div>';
    }
  } catch (error) {
    console.error('Error loading users:', error);
    showToast('Failed to load users', 'error');
  }
}

/**
 * @description Update an existing user's role.
 */
async function updateUserRole(userId, email, role) {
  const label = role === 'admin' ? 'admin' : 'user';
  if (!confirm(`Make ${email} a ${label}?`)) return;

  try {
    showLoading();
    await apiRequest(`/users/${userId}/role`, 'PUT', { role });
    hideLoading();
    showToast(`User role updated for ${email}`);
    loadUsers();
  } catch (error) {
    hideLoading();
    showToast(error.message || 'Failed to update user role', 'error');
  }
}

/**
 * @description Add a user to the server.
 */
export async function addUser(email, role, password) {
  try {
    showLoading();
    const body = { email, role };
    if (password) body.password = password;
    const response = await apiRequest('/users/add', 'POST', body);
    hideLoading();

    if (response.success) {
      showToast(`User ${email} added successfully!`);
      loadUsers();
    }
  } catch (error) {
    hideLoading();
    showToast(error.message || 'Failed to add user', 'error');
  }
}

/**
 * @description Admin: reset a user's password.
 */
async function resetUserPassword(userId, email) {
  const password = prompt(`Enter new password for ${email} (min 8 characters):`);
  if (!password) return;
  if (password.length < 8) {
    showToast('Password must be at least 8 characters', 'error');
    return;
  }

  try {
    showLoading();
    await apiRequest(`/users/${userId}/reset-password`, 'POST', { password });
    hideLoading();
    showToast(`Password reset for ${email}`);
  } catch (error) {
    hideLoading();
    showToast(error.message || 'Failed to reset password', 'error');
  }
}

/**
 * @description Remove a user from the server.
 */
export async function removeUser(userId, email) {
  if (confirm(`Are you sure you want to remove user ${email}?`)) {
    try {
      showLoading();
      await apiRequest(`/users/${userId}`, 'DELETE');
      hideLoading();

      showToast(`User ${email} has been removed`);
      loadUsers();
    } catch (error) {
      hideLoading();
      showToast(error.message || 'Failed to remove user', 'error');
    }
  }
}
