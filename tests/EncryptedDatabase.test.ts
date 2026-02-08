import { describe, it, expect } from 'vitest';

import type { DatabaseOperations } from '../src/interfaces';

import { EncryptedDatabase } from '../src/infrastructure/EncryptedDatabase';

/**
 * Simple in-memory store for testing.
 */
class MemoryDB implements DatabaseOperations {
  private data: Record<string, any> = {};

  async get<T>(key: string): Promise<T | null> {
    return this.data[key] ?? null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.data[key] = value;
  }

  async delete(key: string): Promise<void> {
    delete this.data[key];
  }

  async list<T>(prefix: string): Promise<T[]> {
    return Object.entries(this.data)
      .filter(([key]) => key.startsWith(prefix))
      .map(([, value]) => value as T);
  }

  /** Expose raw storage for assertions. */
  getRaw(key: string): any {
    return this.data[key];
  }
}

describe('EncryptedDatabase', () => {
  const KEY = 'test-encryption-key';

  it('should round-trip a simple value through encrypt/decrypt', async () => {
    const inner = new MemoryDB();
    const db = new EncryptedDatabase(inner, KEY);

    const original = { content: 'Hello, World!', count: 42 };
    await db.set('msg:1', original);
    const result = await db.get('msg:1');

    expect(result).toEqual(original);
  });

  it('should store encrypted data (not plaintext) in the inner database', async () => {
    const inner = new MemoryDB();
    const db = new EncryptedDatabase(inner, KEY);

    await db.set('msg:1', { content: 'secret message' });
    const raw = inner.getRaw('msg:1');

    expect(typeof raw).toBe('string');
    expect(raw).not.toContain('secret message');
    // Format: iv:authTag:ciphertext (three base64 segments)
    expect(raw.split(':').length).toBe(3);
  });

  it('should return null for non-existent keys', async () => {
    const inner = new MemoryDB();
    const db = new EncryptedDatabase(inner, KEY);

    const result = await db.get('does-not-exist');
    expect(result).toBeNull();
  });

  it('should decrypt items in list()', async () => {
    const inner = new MemoryDB();
    const db = new EncryptedDatabase(inner, KEY);

    await db.set('user:1', { name: 'Alice' });
    await db.set('user:2', { name: 'Bob' });
    await db.set('channel:1', { name: 'General' });

    const users = await db.list<{ name: string }>('user:');
    expect(users).toHaveLength(2);
    expect(users.map((u) => u.name).sort()).toEqual(['Alice', 'Bob']);
  });

  it('should delete keys', async () => {
    const inner = new MemoryDB();
    const db = new EncryptedDatabase(inner, KEY);

    await db.set('msg:1', { content: 'bye' });
    await db.delete('msg:1');

    const result = await db.get('msg:1');
    expect(result).toBeNull();
  });

  it('should return null when decrypting with a wrong key', async () => {
    const inner = new MemoryDB();
    const dbWrite = new EncryptedDatabase(inner, 'key-one');
    const dbRead = new EncryptedDatabase(inner, 'key-two');

    await dbWrite.set('msg:1', { content: 'secret' });
    const result = await dbRead.get('msg:1');

    expect(result).toBeNull();
  });

  it('should skip items that fail decryption in list()', async () => {
    const inner = new MemoryDB();
    const dbWrite = new EncryptedDatabase(inner, 'key-one');
    const dbRead = new EncryptedDatabase(inner, 'key-two');

    await dbWrite.set('msg:1', { content: 'a' });
    await dbWrite.set('msg:2', { content: 'b' });

    const results = await dbRead.list('msg:');
    expect(results).toEqual([]);
  });

  it('should handle complex nested objects', async () => {
    const inner = new MemoryDB();
    const db = new EncryptedDatabase(inner, KEY);

    const message = {
      id: 'abc123',
      content: 'Hello with special chars: éàü 🎉',
      author: { id: 'user1', userName: 'alice' },
      images: ['img1.png', 'img2.png'],
      channelId: 'chan1',
      createdAt: 1700000000,
      reactions: { user1: ['👍', '❤️'], user2: ['🎉'] }
    };

    await db.set('message:abc123', message);
    const result = await db.get('message:abc123');

    expect(result).toEqual(message);
  });

  it('should produce different ciphertexts for the same plaintext (unique IVs)', async () => {
    const inner = new MemoryDB();
    const db = new EncryptedDatabase(inner, KEY);

    await db.set('msg:1', { content: 'same' });
    await db.set('msg:2', { content: 'same' });

    const raw1 = inner.getRaw('msg:1');
    const raw2 = inner.getRaw('msg:2');

    expect(raw1).not.toEqual(raw2);
  });
});
