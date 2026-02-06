import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync
} from 'node:crypto';

import type { DatabaseOperations } from '../interfaces';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const SALT = 'mikrochat';

/**
 * @description Wraps a `DatabaseOperations` instance with AES-256-GCM encryption.
 * Values are encrypted on write and decrypted on read. Keys are left in plaintext
 * so prefix-based listing still works.
 */
export class EncryptedDatabase implements DatabaseOperations {
  private readonly inner: DatabaseOperations;
  private readonly derivedKey: Buffer;

  constructor(inner: DatabaseOperations, encryptionKey: string) {
    this.inner = inner;
    this.derivedKey = scryptSync(encryptionKey, SALT, KEY_LENGTH);
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.inner.get<string>(key);
    if (raw === null || raw === undefined) return null;

    try {
      return this.decrypt<T>(raw);
    } catch {
      console.warn(`Failed to decrypt value for key "${key}" — returning null`);
      return null;
    }
  }

  async set<T>(key: string, value: T, expirySeconds?: number): Promise<void> {
    const encrypted = this.encrypt(value);
    await this.inner.set(key, encrypted, expirySeconds);
  }

  async delete(key: string): Promise<void> {
    await this.inner.delete(key);
  }

  async list<T>(prefix: string): Promise<T[]> {
    const rawItems = await this.inner.list<string>(prefix);
    const results: T[] = [];

    for (const raw of rawItems) {
      try {
        results.push(this.decrypt<T>(raw));
      } catch {
        // Skip items that can't be decrypted (corrupted or from a different key)
      }
    }

    return results;
  }

  private encrypt<T>(value: T): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.derivedKey, iv, {
      authTagLength: AUTH_TAG_LENGTH
    });

    const json = JSON.stringify(value);
    const encrypted = Buffer.concat([
      cipher.update(json, 'utf8'),
      cipher.final()
    ]);
    const authTag = cipher.getAuthTag();

    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
  }

  private decrypt<T>(encoded: string): T {
    const [ivB64, tagB64, dataB64] = encoded.split(':');
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(tagB64, 'base64');
    const encrypted = Buffer.from(dataB64, 'base64');

    const decipher = createDecipheriv(ALGORITHM, this.derivedKey, iv, {
      authTagLength: AUTH_TAG_LENGTH
    });
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);

    return JSON.parse(decrypted.toString('utf8')) as T;
  }
}
