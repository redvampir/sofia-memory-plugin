const LRU = require('./lru');

class TieredMemory {
  constructor({ hotSize = 100, coldSize = 100, archive } = {}) {
    this.hot = new LRU(hotSize);
    this.cold = new LRU(coldSize);
    this.archive = archive || {
      async load() {
        return undefined;
      },
      async store() {
        // no-op
      },
    };
  }

  async load(key) {
    let value = this.hot.get(key);
    if (value !== undefined) return value;

    value = this.cold.get(key);
    if (value !== undefined) {
      this.cold.delete(key);
      await this.store(key, value);
      return value;
    }

    value = await this.archive.load(key);
    if (value !== undefined && value !== null) {
      await this.store(key, value);
      return value;
    }
    return undefined;
  }

  async store(key, value) {
    const evicted = this.hot.set(key, value);
    if (evicted) {
      const evictedCold = this.cold.set(evicted.key, evicted.value);
      if (evictedCold) {
        await this.archive.store(evictedCold.key, evictedCold.value);
      }
    }
  }
}

module.exports = { TieredMemory, LRU };
