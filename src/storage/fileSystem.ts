import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

export function getUploadDirectory() {
  return resolve(process.cwd(), 'uploads');
}

export function ensureUploadDirectory() {
  const uploadDirectory = getUploadDirectory();
  if (!existsSync(uploadDirectory)) mkdirSync(uploadDirectory, { recursive: true });
  return uploadDirectory;
}

export function getFileExtension(filename: string) {
  return filename.split('.').pop()?.toLowerCase();
}

export function createStoredFilename(fileExtension: string) {
  return `${Date.now()}-${randomBytes(16).toString('hex')}.${fileExtension}`;
}

export function isInvalidFilename(filename?: string) {
  return !filename || filename.includes('..') || filename.includes('/') || filename.includes('\\');
}

export function isWithinDirectory(directory: string, filePath: string) {
  const path = relative(directory, resolve(filePath));
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

export function sanitizeDisplayName(filename: string) {
  return (
    filename
      .replace(/[\\/]/g, '')
      .replace(/[\r\n]+/g, ' ')
      .replace(/"/g, '')
      .replace(/\s+/g, ' ')
      .trim() || 'attachment'
  );
}
