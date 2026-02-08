import { state } from './state.mjs';
import { previewImage, imagePreviewModal } from './dom.mjs';
import { DEBUG_MODE } from './config.mjs';
import { showToast, updatePendingUploadsUI } from './ui.mjs';
import { getAccessToken } from './auth.mjs';

/**
 * @description React to images being added to a message.
 */
export async function handleAddImages(files) {
  for (const file of files) {
    if (!file.type.match('image.*')) {
      showToast('Only image files are supported', 'error');
      continue;
    }

    try {
      const fileHash = await generateFileHash(file);

      const isDuplicate = state.pendingUploads.some(
        (upload) => upload.fileHash === fileHash
      );
      if (isDuplicate) {
        showToast('This image is already in your pending uploads', 'info');
        continue;
      }

      const imageInfo = await resizeAndCompressImage(file);
      const thumbnailBlob = await generateThumbnail(imageInfo.blob);
      const timestamp = Date.now();
      const extension = file.name.split('.').pop().toLowerCase();
      const fileName = `${timestamp}.${extension}`;

      if (DEBUG_MODE) {
        if (imageInfo.usedOriginal) {
          showToast('Used original image (no compression needed)', 'info');
        } else if (imageInfo.compressionRatio > 0) {
          showToast(
            `Image compressed by ${imageInfo.compressionRatio.toFixed(0)}%`,
            'info'
          );
        } else if (imageInfo.compressionRatio <= 0) {
          showToast(
            `Image processed (size increased by ${Math.abs(imageInfo.compressionRatio).toFixed(0)}%)`,
            'info'
          );
        }
      }

      state.pendingUploads.push({
        fileName,
        fileHash,
        blob: imageInfo.blob,
        thumbnailBlob,
        preview: URL.createObjectURL(imageInfo.blob)
      });

      updatePendingUploadsUI();
    } catch (error) {
      console.error('Error processing image:', error);
      showToast('Failed to process image', 'error');
    }
  }
}

/**
 * @description Remove an individual pending image upload from the queue.
 */
export function removePendingUpload(index) {
  URL.revokeObjectURL(state.pendingUploads[index].preview);

  state.pendingUploads.splice(index, 1);

  updatePendingUploadsUI();
}

/**
 * @description Resize and compress image.
 */
export function resizeAndCompressImage(file) {
  return new Promise((resolve, reject) => {
    if (DEBUG_MODE)
      console.log(
        `Original image: ${file.name}, Size: ${formatFileSize(file.size)}`
      );

    const reader = new FileReader();

    reader.onload = function (e) {
      const img = new Image();

      img.onload = function () {
        const originalWidth = img.width;
        const originalHeight = img.height;
        const originalDimensions = `${originalWidth}x${originalHeight}`;

        let width = originalWidth;
        let height = originalHeight;
        const maxDimension = 1200;

        if (width > height && width > maxDimension) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else if (height > maxDimension) {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }

        const needsResize =
          originalWidth !== width || originalHeight !== height;

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        let quality = 0.7; // Default quality
        let mimeType = file.type;

        const fileExt = file.name.split('.').pop().toLowerCase();

        if (fileExt === 'png') {
          // For PNG files, use PNG format with high quality
          mimeType = 'image/png';
          quality = 0.8;
        } else if (fileExt === 'jpg' || fileExt === 'jpeg') {
          // For JPEG files, use JPEG format with moderate compression
          mimeType = 'image/jpeg';
          quality = 0.7;
        } else if (fileExt === 'webp') {
          // For WebP, use WebP with good compression
          mimeType = 'image/webp';
          quality = 0.75;
        }

        // Convert to blob with appropriate compression
        canvas.toBlob(
          (blob) => {
            if (blob) {
              // If the processed image is larger or the same size as original and we didn't resize
              if (blob.size >= file.size && !needsResize) {
                if (DEBUG_MODE)
                  console.log(
                    'Processed image is larger than original. Using original file instead.'
                  );

                // Use the original file if our processing made it larger
                const imageInfo = {
                  blob: file,
                  originalSize: file.size,
                  newSize: file.size,
                  compressionRatio: 0,
                  originalDimensions,
                  newDimensions: originalDimensions,
                  usedOriginal: true
                };
                resolve(imageInfo);
              } else {
                const compressionRatio = (
                  (1 - blob.size / file.size) *
                  100
                ).toFixed(2);

                if (DEBUG_MODE) {
                  console.log(
                    `Processed image: ${width}x${height} (from ${originalDimensions})`
                  );
                  console.log(
                    `New size: ${formatFileSize(blob.size)}, Reduction: ${compressionRatio}%`
                  );
                }

                // Create an info object to return with the blob
                const imageInfo = {
                  blob,
                  originalSize: file.size,
                  newSize: blob.size,
                  compressionRatio: Number.parseFloat(compressionRatio),
                  originalDimensions,
                  newDimensions: `${width}x${height}`,
                  usedOriginal: false
                };

                resolve(imageInfo);
              }
            } else {
              reject(new Error('Failed to create image blob'));
            }
          },
          mimeType,
          quality
        );
      };

      img.onerror = function () {
        reject(new Error('Failed to load image'));
      };

      img.src = e.target.result;
    };

    reader.onerror = function () {
      reject(new Error('Failed to read file'));
    };

    reader.readAsDataURL(file);
  });
}

/**
 * @description Generate a small thumbnail from an image blob.
 * Uses canvas to resize to max 200px and compress as JPEG at 0.6 quality.
 */
export function generateThumbnail(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = function () {
      URL.revokeObjectURL(url);

      let width = img.width;
      let height = img.height;
      const maxDimension = 400;

      if (width > height && width > maxDimension) {
        height = Math.round((height * maxDimension) / width);
        width = maxDimension;
      } else if (height > maxDimension) {
        width = Math.round((width * maxDimension) / height);
        height = maxDimension;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (thumbBlob) => {
          if (thumbBlob) resolve(thumbBlob);
          else reject(new Error('Failed to create thumbnail'));
        },
        'image/jpeg',
        0.6
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for thumbnail'));
    };

    img.src = url;
  });
}

/**
 * @description Utility function to format file size into more legible number.
 */
export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / 1048576).toFixed(2)} MB`;
}

/**
 * @description Base64-encode an image from easy transmission to the backend.
 */
export function convertBlobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      // Removes the data URL prefix (e.g., "data:image/png;base64,")
      const base64String = reader.result.split(',')[1];
      resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * @description Creates a file hash from the file contents.
 * Uses, for example, for deduplicating uploads.
 */
export async function generateFileHash(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const arrayBuffer = event.target.result;
      const hashValue = hashSimple(arrayBuffer);
      resolve(hashValue);
    };
    reader.readAsArrayBuffer(file);
  });
}

/**
 * @description Simple hash function for ArrayBuffers.
 */
export function hashSimple(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  let hash = 0;
  const step = Math.max(1, Math.floor(arrayBuffer.byteLength / 1000));

  for (let i = 0; i < arrayBuffer.byteLength; i += step) {
    const byte =
      i + 3 < arrayBuffer.byteLength ? view.getUint32(i) : view.getUint8(i);
    hash = (hash << 5) - hash + byte;
    hash |= 0; // Convert to 32bit integer
  }

  return hash.toString(16); // Convert to hex
}

/**
 * @description Pop open the image preview for a clicked image.
 */
export async function openImagePreview(imageUrl) {
  previewImage.src = ''; // Clear current image
  imagePreviewModal.classList.add('active');

  // Show loading indicator in the preview
  previewImage.style.display = 'none';
  const loadingIndicator = document.createElement('div');
  loadingIndicator.className = 'loading-spinner';
  imagePreviewModal
    .querySelector('.image-preview-container')
    .appendChild(loadingIndicator);

  // Fetch image with authentication
  await getAccessToken().then((token) => {
    fetch(imageUrl, {
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
        previewImage.src = objectUrl;
        previewImage.style.display = 'block';

        // Remove loading indicator
        const spinner = imagePreviewModal.querySelector('.loading-spinner');
        if (spinner) spinner.remove();

        // Store the objectUrl to revoke later
        previewImage.setAttribute('data-object-url', objectUrl);
      })
      .catch((error) => {
        console.error('Error fetching preview image:', error);
        previewImage.style.display = 'none';
        imagePreviewModal.querySelector('.image-preview-container').innerHTML =
          '<div class="image-error">Failed to load image</div>';
      });
  });
}
