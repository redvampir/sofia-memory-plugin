class GapAnalyzer {
  constructor(opts = {}) {
    this.confidenceThreshold = opts.confidenceThreshold || 0.75;
    this.uncertaintyRules = opts.uncertaintyRules || [
      { keyword: 'maybe', impact: 0.5, priority: 2 },
      { keyword: 'perhaps', impact: 0.5, priority: 2 },
      { keyword: 'might', impact: 0.3, priority: 1 },
      { keyword: 'possibly', impact: 0.3, priority: 1 },
      { keyword: 'uncertain', impact: 0.7, priority: 3 },
      { keyword: 'unknown', impact: 0.7, priority: 3 },
      { keyword: 'not sure', impact: 0.7, priority: 3 }
    ];
    this.undefinedPattern = opts.undefinedPattern || /<[^>]+>|\bTBD\b|\?\?\?|\bTODO\b/g;
    this.referenceRules = opts.referenceRules || [
      { keyword: 'citation needed', priority: 3 },
      { keyword: 'source?', priority: 2 },
      { keyword: 'ref?', priority: 2 },
      { keyword: 'according to', priority: 2 }
    ];
  }

  analyze(draft = '') {
    const uncertainties = [];
    const undefinedTerms = [];
    const missingReferences = [];

    const sentences = draft.split(/(?<=[.!?])\s+/);
    for (const sentence of sentences) {
      if (!sentence.trim()) continue;
      const lower = sentence.toLowerCase();

      let confidence = 1;
      let priority = 0;
      for (const rule of this.uncertaintyRules) {
        if (lower.includes(rule.keyword)) {
          confidence -= rule.impact;
          priority = Math.max(priority, rule.priority);
        }
      }
      if (confidence < this.confidenceThreshold) {
        uncertainties.push({ text: sentence.trim(), confidence, priority });
      }

      let match;
      while ((match = this.undefinedPattern.exec(sentence)) !== null) {
        undefinedTerms.push({ term: match[0], priority: 3 });
      }
      this.undefinedPattern.lastIndex = 0;

      for (const rule of this.referenceRules) {
        if (lower.includes(rule.keyword)) {
          const hasCitation = /\[[^\]]+\]|https?:\/\//.test(sentence);
          if (!hasCitation) {
            missingReferences.push({ text: sentence.trim(), priority: rule.priority });
          }
        }
      }
    }

    return { uncertainties, undefinedTerms, missingReferences };
  }
}

module.exports = GapAnalyzer;
