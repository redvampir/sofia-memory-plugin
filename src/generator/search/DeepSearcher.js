const SessionSummarizer = require('../summarization/SessionSummarizer');

class DeepSearcher {
  constructor(opts = {}) {
    this.hotCache = opts.hotCache || null;
    this.warmStorage = opts.warmStorage || null;
    this.coldStorage = opts.coldStorage || null;
    this.externalSources = opts.externalSources || [];
    this.timeout = opts.timeout || 1000; // default timeout in ms
    this.sessionSummarizer = opts.sessionSummarizer || new SessionSummarizer();
  }

  async search(query, referenceIds = [], context = {}) {
    const results = new Map();

    const addResults = items => {
      if (!items) return;
      for (const item of items) {
        const key = this._key(item);
        if (!results.has(key)) results.set(key, item);
      }
    };

    const refs = new Set(Array.isArray(referenceIds) ? referenceIds : []);
    const markerPattern = /\[\[REF:([^\]]+)\]\]/g;
    let match;
    while ((match = markerPattern.exec(query)) !== null) {
      refs.add(match[1]);
    }
    markerPattern.lastIndex = 0;

    if (refs.size) {
      for (const id of refs) {
        const full = this.sessionSummarizer.getFullText(id);
        if (full) {
          addResults([{ id, content: full }]);
          if (context) {
            if (!Array.isArray(context.usedFullTexts)) context.usedFullTexts = [];
            context.usedFullTexts.push(id);
            if (!Array.isArray(context.hotCache)) context.hotCache = [];
            context.hotCache.push(full);
          }
        }
      }
    }

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

