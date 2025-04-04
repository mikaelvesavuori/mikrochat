import type { DatabaseOperations } from '../interfaces';

import { GeneralStorageProvider } from './GeneralStorageProvider';

/**
 * @description Use an in-memory data representation.
 */
export class InMemoryProvider extends GeneralStorageProvider {
  protected db: DatabaseOperations;

  constructor() {
    super();
    this.db = new MockDatabase();
  }
}

/**
 * @description Implementation of an in-memory database.
 */
class MockDatabase implements DatabaseOperations {
  private data: Record<string, any> = {};

  public async get<T>(key: string): Promise<T | null> {
    return this.data[key] || null;
  }

  public async set<T>(key: string, value: T): Promise<void> {
    this.data[key] = value;
  }

  public async delete(key: string): Promise<void> {
    delete this.data[key];
  }

  public async list<T>(prefix: string): Promise<T[]> {
    const result: T[] = [];

    for (const key in this.data) {
      if (key.startsWith(prefix)) result.push(this.data[key]);
    }

    return result;
  }
}
