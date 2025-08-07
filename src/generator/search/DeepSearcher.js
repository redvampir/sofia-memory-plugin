class DeepSearcher {
  constructor(opts = {}) {
    this.hotCache = opts.hotCache || null;
    this.warmStorage = opts.warmStorage || null;
    this.coldStorage = opts.coldStorage || null;
    this.externalSources = opts.externalSources || [];
    this.timeout = opts.timeout || 1000; // default timeout in ms
  }

  async search(query) {
    const results = new Map();

    const addResults = items => {
      if (!items) return;
      for (const item of items) {
        const key = this._key(item);
        if (!results.has(key)) results.set(key, item);
      }
    };

    // Hot cache first
    if (this.hotCache && typeof this.hotCache.search === 'function') {
      try {
        const hot = await this._withTimeout(this.hotCache.search(query));
        addResults(hot);
      } catch (e) {
        // ignore hot cache errors
      }
    }

    // Warm and cold storage in parallel
    const storagePromises = [];
    if (this.warmStorage && typeof this.warmStorage.search === 'function') {
      storagePromises.push(this._withTimeout(this.warmStorage.search(query)));
    }
    if (this.coldStorage && typeof this.coldStorage.search === 'function') {
      storagePromises.push(this._withTimeout(this.coldStorage.search(query)));
    }
    const storageResults = await Promise.allSettled(storagePromises);
    for (const r of storageResults) {
      if (r.status === 'fulfilled') addResults(r.value);
    }

    // External sources last
    if (Array.isArray(this.externalSources) && this.externalSources.length) {
      const extPromises = this.externalSources
        .filter(s => s && typeof s.search === 'function')
        .map(s => this._withTimeout(s.search(query)));
      const extResults = await Promise.allSettled(extPromises);
      for (const r of extResults) {
        if (r.status === 'fulfilled') addResults(r.value);
      }
    }

    return Array.from(results.values());
  }

  _withTimeout(promise, ms = this.timeout) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout')), ms);
      Promise.resolve(promise).then(
        value => {
          clearTimeout(timer);
          resolve(value);
        },
        err => {
          clearTimeout(timer);
          reject(err);
        }
      );
    });
  }

  _key(item) {
    if (item && typeof item === 'object') {
      return item.id || JSON.stringify(item);
    }
    return item;
  }
}

module.exports = DeepSearcher;

