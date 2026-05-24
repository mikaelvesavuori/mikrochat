import { state } from './state.mjs';
import { apiRequest } from './api.mjs';
import { showToast, updatePendingUploadsUI } from './ui.mjs';
import { convertBlobToBase64, formatFileSize, generateFileHash } from './images.mjs';

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([
  'pdf',
  'txt',
  'md',
  'csv',
  'json',
  'zip',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx'
]);

export async function handleAddFiles(files) {
  for (const file of files) {
    const extension = file.name.split('.').pop()?.toLowerCase();

    if (!extension || !ALLOWED_EXTENSIONS.has(extension)) {
      showToast('This file type is not supported', 'error');
      continue;
    }

    if (file.size > MAX_FILE_SIZE) {
      showToast('Files can be up to 25 MB', 'error');
      continue;
    }

    const fileHash = await generateFileHash(file);
    const isDuplicate = state.pendingFiles.some((upload) => upload.fileHash === fileHash);
    if (isDuplicate) {
      showToast('This file is already attached', 'info');
      continue;
    }

    state.pendingFiles.push({
      file,
      fileHash,
      name: file.name,
      size: file.size,
      contentType: file.type || 'application/octet-stream'
    });
  }

  updatePendingUploadsUI();
}

export function removePendingFile(index) {
  state.pendingFiles.splice(index, 1);
  updatePendingUploadsUI();
}

export function clearPendingFiles() {
  state.pendingFiles = [];
  updatePendingUploadsUI();
}

export async function uploadPendingFiles() {
  const attachments = [];

  for (const pendingFile of state.pendingFiles) {
    const encodedFile = await convertBlobToBase64(pendingFile.file);
    const response = await apiRequest('/files', 'POST', {
      filename: pendingFile.name,
      file: encodedFile,
      contentType: pendingFile.contentType
    });

    if (response.attachment) attachments.push(response.attachment);
  }

  clearPendingFiles();
  return attachments;
}

export function formatAttachmentSize(size) {
  return formatFileSize(size);
}
