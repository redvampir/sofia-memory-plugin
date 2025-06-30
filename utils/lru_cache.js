class LRUCache {
  constructor(limit = 100, ttl = 5 * 60 * 1000) {
    this.limit = limit;
    this.ttl = ttl;
    this.map = new Map();
  }

  _isExpired(entry) {
    return this.ttl > 0 && (Date.now() - entry.ts) > this.ttl;
  }

  get(key) {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (this._isExpired(entry)) {
      this.map.delete(key);
      return undefined;
    }
    // refresh order
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key, value) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { value, ts: Date.now() });
    if (this.map.size > this.limit) {
      const oldest = this.map.keys().next().value;
      this.map.delete(oldest);
    }
  }

  delete(key) {
    this.map.delete(key);
  }

  clear() {
    this.map.clear();
  }
}

module.exports = LRUCache;
