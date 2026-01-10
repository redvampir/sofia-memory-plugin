const SOURCE_RELIABILITY = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
  UNKNOWN: 0
};

function calculateSourceLimit({ baseLimit = 10, reliability = 'LOW' } = {}) {
  const relKey = reliability.toUpperCase();
  const weight = SOURCE_RELIABILITY[relKey] ?? SOURCE_RELIABILITY.UNKNOWN;
  const total = SOURCE_RELIABILITY.HIGH + SOURCE_RELIABILITY.MEDIUM + SOURCE_RELIABILITY.LOW;
  const limit = Math.max(1, Math.ceil((baseLimit * weight) / total));
  return limit;
}

class SourceManager {
  constructor() {
    this.sources = [];
  }

  addSource(id, reliability, entries = []) {
    this.sources.push({ id, reliability, entries });
  }

  merge() {
    const relWeight = rel => SOURCE_RELIABILITY[rel?.toUpperCase()] || 0;
    const sorted = [...this.sources].sort((a, b) => relWeight(b.reliability) - relWeight(a.reliability));
    const seen = new Set();
    const totals = new Map();
    const uniques = new Map();
    const result = [];

    for (const src of sorted) {
      totals.set(src.id, src.entries.length);
      uniques.set(src.id, 0);
      for (const entry of src.entries) {
        const content = entry && entry.content;
        if (!content) continue;
        if (!seen.has(content)) {
          seen.add(content);
          result.push({ ...entry, source: src.id });
          uniques.set(src.id, uniques.get(src.id) + 1);
        }
      }
    }

    const final = result.filter(e => {
      const u = uniques.get(e.source) || 0;
      const t = totals.get(e.source) || 1;
      return u / t >= 0.3;
    });

    return final;
  }
}

module.exports = {
  SOURCE_RELIABILITY,
  calculateSourceLimit,
  SourceManager
};
