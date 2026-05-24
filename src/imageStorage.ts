import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  createStoredFilename,
  ensureUploadDirectory,
  getFileExtension,
  getUploadDirectory,
  isInvalidFilename,
  isWithinDirectory
} from './storage/fileSystem';

const MAX_IMAGE_SIZE_IN_MB = 10;
const VALID_FILE_FORMATS = ['jpg', 'jpeg', 'png', 'webp', 'svg'];

type ImageUploadBody = {
  filename?: string;
  image?: string;
  thumbnail?: string;
};

export type StoredImage = {
  buffer: Buffer;
  contentType: string;
};

export class ImageStorageError extends Error {
  public readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'ImageStorageError';
    this.status = status;
  }
}

export function uploadImage(body: ImageUploadBody): string {
  const { filename, image, thumbnail } = body;

  if (!filename) throw new ImageStorageError('Filename is required');
  if (!image) throw new ImageStorageError('No image provided');

  const fileExtension = getFileExtension(filename);
  if (!fileExtension) throw new ImageStorageError('Missing file extension');

  if (!VALID_FILE_FORMATS.includes(fileExtension))
    throw new ImageStorageError('Unsupported file format');

  const imageBuffer = Buffer.from(image, 'base64');
  const maxImageSize = MAX_IMAGE_SIZE_IN_MB * 1024 * 1024;
  if (imageBuffer.length > maxImageSize) throw new ImageStorageError('Image too large');

  const uploadDirectory = ensureUploadDirectory();

  const savedFileName = createStoredFilename(fileExtension);
  const uploadPath = join(uploadDirectory, savedFileName);

  writeFileSync(uploadPath, imageBuffer);

  if (thumbnail) saveThumbnail(uploadDirectory, savedFileName, thumbnail);

  return savedFileName;
}

export function serveImage(filename: string, useThumbnail: boolean): StoredImage {
  if (isInvalidFilename(filename)) throw new ImageStorageError('Invalid filename');

  const uploadDirectory = getUploadDirectory();
  const thumbPath = join(uploadDirectory, `thumb-${filename}`);
  const filePath =
    useThumbnail && existsSync(thumbPath) ? thumbPath : join(uploadDirectory, filename);

  if (!isWithinDirectory(uploadDirectory, filePath))
    throw new ImageStorageError('Invalid filename');

  if (!existsSync(filePath)) throw new ImageStorageError('Image not found', 404);

  const fileExtension =
    useThumbnail && existsSync(thumbPath) ? 'jpg' : getFileExtension(filename) || '';

  return {
    buffer: readFileSync(filePath),
    contentType: getContentType(fileExtension)
  };
}

export function deleteImages(images: string[]) {
  const uploadDirectory = getUploadDirectory();

  for (const image of images) {
    if (isInvalidFilename(image)) continue;

    const imagePath = join(uploadDirectory, image);
    const thumbPath = join(uploadDirectory, `thumb-${image}`);

    if (!isWithinDirectory(uploadDirectory, imagePath)) continue;

    try {
      if (existsSync(imagePath)) unlinkSync(imagePath);
      if (existsSync(thumbPath)) unlinkSync(thumbPath);
    } catch (error) {
      console.error(`Failed to delete image ${image}:`, error);
    }
  }
}

function getContentType(fileExtension: string) {
  if (fileExtension === 'jpg' || fileExtension === 'jpeg') return 'image/jpeg';
  if (fileExtension === 'png') return 'image/png';
  if (fileExtension === 'webp') return 'image/webp';
  if (fileExtension === 'svg') return 'image/svg+xml';
  return 'application/octet-stream';
}

function saveThumbnail(uploadDirectory: string, savedFileName: string, thumbnailBase64: string) {
  try {
    const thumbBuffer = Buffer.from(thumbnailBase64, 'base64');
    const thumbPath = join(uploadDirectory, `thumb-${savedFileName}`);
    writeFileSync(thumbPath, thumbBuffer);
  } catch (error) {
    console.error('Failed to save thumbnail:', error);
  }
}
