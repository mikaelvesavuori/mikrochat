import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { FileAttachment } from './interfaces';
import {
  createStoredFilename,
  ensureUploadDirectory,
  getFileExtension,
  getUploadDirectory,
  isInvalidFilename,
  isWithinDirectory,
  sanitizeDisplayName
} from './storage/fileSystem';

const MAX_FILE_SIZE_IN_MB = 25;
const VALID_FILE_FORMATS = [
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
];

type FileUploadBody = {
  filename?: string;
  file?: string;
  contentType?: string;
};

export type StoredFile = {
  buffer: Buffer;
  contentType: string;
  originalName: string;
};

export class FileStorageError extends Error {
  public readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'FileStorageError';
    this.status = status;
  }
}

export function uploadFile(body: FileUploadBody): FileAttachment {
  const { filename, file, contentType } = body;

  if (!filename) throw new FileStorageError('Filename is required');
  if (!file) throw new FileStorageError('No file provided');

  const fileExtension = getFileExtension(filename);
  if (!fileExtension) throw new FileStorageError('Missing file extension');

  if (!VALID_FILE_FORMATS.includes(fileExtension))
    throw new FileStorageError('Unsupported file format');

  const fileBuffer = Buffer.from(file, 'base64');
  const maxFileSize = MAX_FILE_SIZE_IN_MB * 1024 * 1024;
  if (fileBuffer.length > maxFileSize) throw new FileStorageError('File too large');

  const uploadDirectory = ensureUploadDirectory();

  const storedName = createStoredFilename(fileExtension);
  const uploadPath = join(uploadDirectory, storedName);

  writeFileSync(uploadPath, fileBuffer);

  return {
    filename: storedName,
    originalName: sanitizeDisplayName(filename),
    contentType: contentType || getContentType(fileExtension),
    size: fileBuffer.length
  };
}

export function serveFile(attachment: FileAttachment): StoredFile {
  const filename = attachment.filename;
  if (isInvalidFilename(filename)) throw new FileStorageError('Invalid filename');

  const uploadDirectory = getUploadDirectory();
  const filePath = join(uploadDirectory, filename);

  if (!isWithinDirectory(uploadDirectory, filePath)) throw new FileStorageError('Invalid filename');

  if (!existsSync(filePath)) throw new FileStorageError('File not found', 404);

  return {
    buffer: readFileSync(filePath),
    contentType: attachment.contentType || getContentType(getFileExtension(filename) || ''),
    originalName: sanitizeDisplayName(attachment.originalName || filename)
  };
}

export function deleteFiles(attachments: FileAttachment[] = []) {
  const uploadDirectory = getUploadDirectory();

  for (const attachment of attachments) {
    const filename = attachment.filename;
    if (isInvalidFilename(filename)) continue;

    const filePath = join(uploadDirectory, filename);
    if (!isWithinDirectory(uploadDirectory, filePath)) continue;

    try {
      if (existsSync(filePath)) unlinkSync(filePath);
    } catch (error) {
      console.error(`Failed to delete file ${filename}:`, error);
    }
  }
}

function getContentType(fileExtension: string) {
  if (fileExtension === 'pdf') return 'application/pdf';
  if (fileExtension === 'txt') return 'text/plain';
  if (fileExtension === 'md') return 'text/markdown';
  if (fileExtension === 'csv') return 'text/csv';
  if (fileExtension === 'json') return 'application/json';
  if (fileExtension === 'zip') return 'application/zip';
  if (fileExtension === 'doc') return 'application/msword';
  if (fileExtension === 'docx')
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (fileExtension === 'xls') return 'application/vnd.ms-excel';
  if (fileExtension === 'xlsx')
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (fileExtension === 'ppt') return 'application/vnd.ms-powerpoint';
  if (fileExtension === 'pptx')
    return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  return 'application/octet-stream';
}
