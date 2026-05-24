import { existsSync, readdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  deleteImages,
  ImageStorageError,
  serveImage,
  uploadImage
} from '../src/imageStorage';

describe('imageStorage', () => {
  const uploadDirectory = resolve(process.cwd(), 'uploads');
  let uploadDirectoryExisted = false;

  beforeAll(() => {
    uploadDirectoryExisted = existsSync(uploadDirectory);
  });

  afterAll(() => {
    if (
      !uploadDirectoryExisted &&
      existsSync(uploadDirectory) &&
      readdirSync(uploadDirectory).length === 0
    )
      rmSync(uploadDirectory, { recursive: true, force: true });
  });

  it('uploads, serves, and deletes images with normalized extensions', () => {
    const filename = uploadImage({
      filename: 'photo.PNG',
      image: Buffer.from('image-content').toString('base64')
    });

    expect(filename).toMatch(/\.png$/);

    const storedImage = serveImage(filename, false);
    expect(storedImage.contentType).toBe('image/png');
    expect(storedImage.buffer.toString()).toBe('image-content');

    deleteImages([filename]);

    expect(() => serveImage(filename, false)).toThrow('Image not found');
  });

  it('rejects unsupported image formats', () => {
    expect(() =>
      uploadImage({
        filename: 'payload.gif',
        image: Buffer.from('image-content').toString('base64')
      })
    ).toThrow(ImageStorageError);
  });

  it('rejects path traversal when serving images', () => {
    expect(() => serveImage('../secret.png', false)).toThrow(
      'Invalid filename'
    );
  });
});
