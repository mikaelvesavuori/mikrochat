import type { MikroDB } from 'mikrodb';
import type { DatabaseOperations } from '../interfaces';

import { GeneralStorageProvider } from './GeneralStorageProvider';

/**
 * @description Use MikroDB for handling data.
 */
export class MikroDBProvider extends GeneralStorageProvider {
  protected db: DatabaseOperations;
  private readonly mikroDb: MikroDB;

  constructor(mikroDb: MikroDB) {
    super();
    this.mikroDb = mikroDb;

    this.db = new MikroDbDatabase(mikroDb);
  }

  /**
   * @description Start the MikroDB instance.
   * This must be called before using any other methods.
   */
  public async start(): Promise<void> {
    await this.mikroDb.start();
  }

  /**
   * @description Close the database connection and clean up resources.
   * This should be called when shutting down the application.
   */
  public async close(): Promise<void> {
    await this.mikroDb.close();
  }
}

/**
 * @description Implementation for MikroDB.
 */
class MikroDbDatabase implements DatabaseOperations {
  private readonly db: MikroDB;
  private readonly tableName: string;

  constructor(db: MikroDB, tableName = 'mikrochat_db') {
    this.db = db;
    this.tableName = tableName;
  }

  /**
   * @description Get a value by key.
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const result = await this.db.get({
        tableName: this.tableName,
        key
      });

      // MikroDB's get returns the value directly when a key is provided
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

    await this.db.write({
      tableName: this.tableName,
      key: key,
      value: value,
      expiration
    });
  }

  /**
   * @description Delete a key.
   */
  async delete(key: string): Promise<void> {
    await this.db.delete({
      tableName: this.tableName,
      key
    });
  }

  /**
   * @description List all values with keys that start with the prefix.
   */
  public async list<T>(prefix: string): Promise<T[]> {
    try {
      const allItems =
        ((await this.db.get({
          tableName: this.tableName
        })) as any[]) || [];

      const filteredItems = allItems
        .filter((item) => {
          // Check if the item is an array with key as the first element
          return (
            Array.isArray(item) &&
            typeof item[0] === 'string' &&
            item[0].startsWith(prefix)
          );
        })
        .map((item) => item[1].value);

      return filteredItems as T[];
    } catch (error) {
      console.error(`Error listing with prefix ${prefix}:`, error);
      return [];
    }
  }
}
