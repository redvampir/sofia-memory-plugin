class LRU {
  constructor(limit = 100) {
    this.limit = limit;
    this.map = new Map();
  }

  get(key) {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key);
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key, value) {
    if (this.map.has(key)) {
      this.map.delete(key);
    }
    this.map.set(key, value);
    if (this.map.size > this.limit) {
      const oldestKey = this.map.keys().next().value;
      const oldestVal = this.map.get(oldestKey);
      this.map.delete(oldestKey);
      return { key: oldestKey, value: oldestVal };
    }
    return null;
  }

  delete(key) {
    this.map.delete(key);
  }

  keys() {
    return Array.from(this.map.keys());
  }
}

module.exports = LRU;
