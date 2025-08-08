class ResponseEnhancer {
  constructor() {
    // keep a running log of every change applied
    this.log = [];
    this.fullReferenceLog = [];
  }

  /**
   * Enhance a draft response using search results.
   * Results are applied in priority order:
   *   CRITICAL_CORRECTION > IMPORTANT_ADDITION > CONTEXT_ENRICHMENT.
   * Each applied change is recorded in the changelog for later inspection.
   *
   * @param {string} draft - original draft text
   * @param {Array<{directive: string, content: string}>} searchResults
   * @returns {{text: string, changes: Array<{directive: string, content: string}>}}
   */
  enhance(draft = '', searchResults = [], context = {}) {
    const priorities = {
      CRITICAL_CORRECTION: 3,
      IMPORTANT_ADDITION: 2,
      CONTEXT_ENRICHMENT: 1
    };
    const prefixes = {
      CRITICAL_CORRECTION: 'Critical correction: ',
      IMPORTANT_ADDITION: 'Important addition: ',
      CONTEXT_ENRICHMENT: 'Context: '
    };

    const ordered = Array.isArray(searchResults)
      ? [...searchResults].sort(
          (a, b) => (priorities[b.directive] || 0) - (priorities[a.directive] || 0)
        )
      : [];

    if (
      context &&
      Array.isArray(context.usedFullTexts) &&
      context.usedFullTexts.length
    ) {
      this.fullReferenceLog.push(...context.usedFullTexts);
      console.log(
        '[ResponseEnhancer] full references used:',
        context.usedFullTexts.join(', ')
      );
    }

    let text = draft;
    const changes = [];

    for (const r of ordered) {
      if (!r || typeof r.content !== 'string') continue;
      const directive = r.directive;
      if (!prefixes[directive]) continue;
      if (text && !text.endsWith('\n')) text += '\n';
      const addition = prefixes[directive] + r.content;
      text += addition;
      const change = { directive, content: r.content };
      changes.push(change);
      this.log.push(change);
    }

    return { text, changes };
  }
}

module.exports = ResponseEnhancer;
