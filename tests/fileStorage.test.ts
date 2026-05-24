import { existsSync, readdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { deleteFiles, FileStorageError, serveFile, uploadFile } from '../src/fileStorage';

describe('fileStorage', () => {
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

  it('uploads, serves, and deletes supported files', () => {
    const attachment = uploadFile({
      filename: 'report.PDF',
      file: Buffer.from('file-content').toString('base64')
    });

    expect(attachment.filename).toMatch(/\.pdf$/);
    expect(attachment.originalName).toBe('report.PDF');
    expect(attachment.contentType).toBe('application/pdf');

    const storedFile = serveFile(attachment);
    expect(storedFile.buffer.toString()).toBe('file-content');

    deleteFiles([attachment]);

    expect(() => serveFile(attachment)).toThrow('File not found');
  });

  it('sanitizes attachment display names', () => {
    const attachment = uploadFile({
      filename: 'sales "Q1"\r\nreport.pdf',
      file: Buffer.from('file-content').toString('base64')
    });

    expect(attachment.originalName).toBe('sales Q1 report.pdf');
    expect(serveFile(attachment).originalName).toBe('sales Q1 report.pdf');

    deleteFiles([attachment]);
  });

  it('rejects unsupported file formats', () => {
    expect(() =>
      uploadFile({
        filename: 'script.sh',
        file: Buffer.from('echo nope').toString('base64')
      })
    ).toThrow(FileStorageError);
  });
});
