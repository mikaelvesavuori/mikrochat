import type { PikoDB } from 'pikodb';
import type { DatabaseOperations } from '../interfaces';

import { EncryptedDatabase } from '../infrastructure/EncryptedDatabase';
import { GeneralStorageProvider } from './GeneralStorageProvider';

/**
 * @description Use PikoDB for handling data.
 */
export class PikoDBProvider extends GeneralStorageProvider {
  protected db: DatabaseOperations;
  private readonly pikoDB: PikoDB;

  constructor(pikoDB: PikoDB, encryptionKey?: string) {
    super();
    this.pikoDB = pikoDB;

    const database: DatabaseOperations = new PikoDbDatabase(pikoDB);
    this.db = encryptionKey
      ? new EncryptedDatabase(database, encryptionKey)
      : database;
  }

  /**
   * @description Start the PikoDB instance.
   * This must be called before using any other methods.
   */
  public async start(): Promise<void> {
    await this.pikoDB.start();
  }

  /**
   * @description Close the database connection and clean up resources.
   * This should be called when shutting down the application.
   */
  public async close(): Promise<void> {
    await this.pikoDB.close();
  }
}

/**
 * @description Implementation for PikoDB.
 * Routes keys to separate tables by prefix so each type is persisted independently,
 * avoiding full-database serialization on every write.
 */
class PikoDbDatabase implements DatabaseOperations {
  private readonly db: PikoDB;

  constructor(db: PikoDB) {
    this.db = db;
  }

  private getTable(key: string): string {
    if (key.startsWith('message:')) return 'messages';
    if (key.startsWith('idx:')) return 'indexes';
    if (key.startsWith('user:')) return 'users';
    if (key.startsWith('channel:')) return 'channels';
    if (key.startsWith('conversation:')) return 'conversations';
    if (key.startsWith('webhook:')) return 'webhooks';
    if (key.startsWith('server:')) return 'settings';
    return 'misc';
  }

  /**
   * @description Get a value by key.
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const result = await this.db.get(this.getTable(key), key);

      if (result === undefined || result === null) return null;
      return result as T;
    } catch (error) {
      console.error(`Error getting key ${key}:`, error);
      return null;
    }
  }

  /**
   * @description Set a value with optional expiry.
   */
  async set<T>(key: string, value: T, expirySeconds?: number): Promise<void> {
    const expiration = expirySeconds ? Date.now() + expirySeconds * 1000 : 0;

    await this.db.write(this.getTable(key), key, value, expiration);
  }

  /**
   * @description Delete a key.
   */
  async delete(key: string): Promise<void> {
    await this.db.delete(this.getTable(key), key);
  }

  /**
   * @description List all values with keys that start with the prefix.
   */
  public async list<T>(prefix: string): Promise<T[]> {
    try {
      const allItems =
        ((await this.db.get(this.getTable(prefix))) as any[]) || [];

      const filteredItems = allItems
        .filter((item) => {
          return (
            Array.isArray(item) &&
            typeof item[0] === 'string' &&
            item[0].startsWith(prefix)
          );
        })
        .map((item) => item[1] as T)
        .filter((value): value is T => value != null);

      return filteredItems;
    } catch (error) {
      console.error(`Error listing with prefix ${prefix}:`, error);
      return [];
    }
  }
}
