/**
 * @description A simple LRU (Least Recently Used) Map.
 * Extends Map to automatically evict the oldest entry when capacity is exceeded.
 * JS Map iteration order is insertion order, so we leverage delete+re-set to "touch" entries.
 */
export class LRUMap extends Map {
  constructor(maxSize) {
    super();
    this.maxSize = maxSize;
  }

  get(key) {
    if (!super.has(key)) return undefined;
    // Move to end (most recently used)
    const value = super.get(key);
    super.delete(key);
    super.set(key, value);
    return value;
  }

  set(key, value) {
    // If key exists, delete first so it moves to the end
    if (super.has(key)) super.delete(key);
    super.set(key, value);
    // Evict oldest if over capacity
    if (super.size > this.maxSize) {
      const oldest = super.keys().next().value;
      super.delete(oldest);
    }
    return this;
  }
}
