import { state } from './state.mjs';
import { AUTH_MODE, API_BASE_URL } from './config.mjs';
import { showToast } from './ui.mjs';
import { getAccessToken, isTokenExpired, refreshTokens } from './auth.mjs';
import { showAuthScreen } from './ui.mjs';
import {
  handleOfflineMessageCreation,
  removeImageFromMessage
} from './messages.mjs';

/**
 * @description Helper function to make API requests to the MikroChat backend.
 */
export async function apiRequest(
  endpoint,
  method = 'GET',
  data = null,
  tokenOverride = null
) {
  // Check if we're offline
  if (!navigator.onLine && method !== 'GET') {
    // For non-GET requests while offline, handle specially
    if (
      endpoint.includes('/channels/') &&
      endpoint.includes('/messages') &&
      method === 'POST'
    ) {
      return handleOfflineMessageCreation(endpoint, data);
    }

    // For other non-GET requests, show offline message and reject
    showToast(
      "You're offline. This action will be available when you reconnect.",
      'error'
    );
    throw new Error('Offline - cannot perform this action');
  }

  if (AUTH_MODE !== 'dev' && endpoint !== '/auth/login') {
    try {
      if (await isTokenExpired()) {
        await refreshTokens();
        const newToken = await getAccessToken();
        if (newToken) await state.storage.setItem('accessToken', newToken);
      }
    } catch (error) {
      console.error('Token refresh failed:', error);

      await state.storage.removeItem('accessToken');
      state.currentUser = null;
      await showAuthScreen();

      showToast('Session expired. Please log in again.', 'error');
      throw new Error('Authentication failed');
    }
  }

  const headers = {
    'Content-Type': 'application/json'
  };

  let token = tokenOverride;

  if (state.isStorageInitialized)
    token = tokenOverride || (await getAccessToken());

  if (token) headers.Authorization = `Bearer ${token}`;

  const options = {
    method,
    headers
  };

  if (data) options.body = JSON.stringify(data);

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, options);

    if (!response.ok) {
      let errorMessage = `Error ${response.status}: ${response.statusText}`;
      try {
        const clonedResponse = response.clone();
        const errorData = await clonedResponse.json().catch(() => ({}));
        errorMessage = errorData.error || errorMessage;
      } catch (e) {
        console.error('Could not parse error response', e);
      }
      throw new Error(errorMessage);
    }

    if (method === 'DELETE' || response.headers.get('content-length') === '0')
      return { success: true };

    // Check if we're dealing with SSE and return raw response for EventSource handling
    if (endpoint === '/events') return response;

    // Check content type to see if we should try to parse JSON
    const contentType = response.headers.get('content-type');

    if (contentType?.includes('application/json')) {
      try {
        // Clone response before parsing to avoid "body already read" errors
        const clonedResponse = response.clone();
        return await clonedResponse.json();
      } catch (jsonError) {
        console.error(
          'JSON parsing error:',
          jsonError,
          'for endpoint:',
          endpoint
        );

        // Fall back to text and see if we can manually parse it
        const text = await response.text();
        try {
          return text ? JSON.parse(text) : { success: true };
        } catch (parseError) {
          console.error('Manual JSON parsing also failed:', parseError);
          return { success: true, text };
        }
      }
    } else {
      // For non-JSON responses (like SSE or others)
      const text = await response.text();
      if (!text) return { success: true };

      // Try to parse as JSON anyway in case content-type is wrong
      try {
        return JSON.parse(text);
      } catch (_e) {
        // Return as plain text if not JSON
        return { success: true, text };
      }
    }
  } catch (error) {
    // Check if error is due to being offline
    if (!navigator.onLine) {
      showToast(
        "You're working offline. Some features may be limited.",
        'info'
      );
    } else {
      showToast(error.message, 'error');
    }
    throw error;
  }
}

/**
 * @description Gets images from the backend. The content is binary,
 * so we will append it as a blob to their respective image DOM elements.
 */
export async function fetchImageWithAuth(
  imageUrl,
  containerId,
  messageId,
  filename,
  useThumbnail = true
) {
  const token = await getAccessToken();
  const fetchUrl = useThumbnail
    ? `${imageUrl}${imageUrl.includes('?') ? '&' : '?'}size=thumb`
    : imageUrl;
  const fullImageUrl = imageUrl; // Always use full URL for preview

  await fetch(fetchUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`
    }
  })
    .then((response) => {
      if (!response.ok) throw new Error('Image fetch failed');
      return response.blob();
    })
    .then((blob) => {
      const objectUrl = URL.createObjectURL(blob);
      const containerElement = document.getElementById(containerId);
      if (containerElement) {
        containerElement.innerHTML = '';

        const imgWrapper = document.createElement('div');
        imgWrapper.className = 'image-wrapper';

        const img = document.createElement('img');
        img.src = objectUrl;
        img.alt = 'User uploaded image';
        img.className = 'message-image';
        img.loading = 'lazy';
        img.setAttribute('onclick', `openImagePreview('${fullImageUrl}')`);
        imgWrapper.appendChild(img);

        const message = state.messageCache.get(messageId);
        const isAuthor =
          message?.author && message.author.id === state.currentUser.id;

        if (isAuthor) {
          const removeBtn = document.createElement('div');
          removeBtn.className = 'remove-image-btn';
          removeBtn.innerHTML = '&times;';
          removeBtn.onclick = function (e) {
            e.stopPropagation();
            if (confirm('Remove this image?')) {
              removeImageFromMessage(messageId, filename);
            }
          };
          imgWrapper.appendChild(removeBtn);
        }

        containerElement.appendChild(imgWrapper);
      }
    })
    .catch((error) => {
      console.error('Error fetching image:', error);
      const containerElement = document.getElementById(containerId);
      if (containerElement) {
        containerElement.innerHTML =
          '<div class="image-error">Failed to load image</div>';
      }
    });
}
