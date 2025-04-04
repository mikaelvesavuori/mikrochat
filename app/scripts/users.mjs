/**
 * @description Get all users on the server.
 */
async function loadUsers() {
  try {
    const response = await apiRequest('/users', 'GET');
    usersList.innerHTML = '';

    if (response.users && response.users.length > 0) {
      const sortedUsers = [...response.users].sort((a, b) => {
        if (a.id === currentUser.id) return -1;
        if (b.id === currentUser.id) return 1;
        return 0;
      });

      for (const user of sortedUsers) {
        const userItem = document.createElement('div');
        userItem.className = 'user-item';
        userItem.dataset.id = user.id;

        userItem.innerHTML = `
          <div class="user-avatar">${getInitials(user.userName || user.email.split('@')[0])}</div>
          <div class="user-info">
            <div class="user-email">${user.email}</div>
            <div class="user-role ${user.isAdmin ? 'admin-role' : 'user-role'}">${user.isAdmin ? 'Admin' : 'User'}</div>
            <div class="user-created">Added ${formatTime(new Date(user.createdAt))}</div>
          </div>
          ${
            user.id !== currentUser.id
              ? `
            <div class="user-actions">
              <button class="remove-user" title="Remove User">✕</button>
            </div>
          `
              : ''
          }
        `;

        const removeButton = userItem.querySelector('.remove-user');
        if (removeButton) {
          removeButton.addEventListener('click', () =>
            removeUser(user.id, user.email)
          );
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
 * @description Add a user to the server.
 */
async function addUser(email, role) {
  try {
    showLoading();
    const response = await apiRequest('/users/add', 'POST', { email, role });
    hideLoading();

    if (response.success) {
      showToast(`User ${email} added successfully!`);
      loadUsers(); // Refresh the users list
    }
  } catch (error) {
    hideLoading();
    showToast(error.message || 'Failed to add user', 'error');
  }
}

/**
 * @description Remove a user from the server.
 */
async function removeUser(userId, email) {
  if (confirm(`Are you sure you want to remove user ${email}?`)) {
    try {
      showLoading();
      await apiRequest(`/users/${userId}`, 'DELETE');
      hideLoading();

      showToast(`User ${email} has been removed`);
      loadUsers(); // Refresh the users list
    } catch (error) {
      hideLoading();
      showToast(error.message || 'Failed to remove user', 'error');
    }
  }
}
