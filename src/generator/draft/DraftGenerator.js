const { loadConfig } = require('../../../config');
const availableNeurons = require('../neurons');

class DraftGenerator {
  constructor() {
    const cfg = loadConfig();
    const names = Array.isArray(cfg.mirrorNeurons) ? cfg.mirrorNeurons : [];
    this.neurons = names
      .map(n => availableNeurons[n])
      .filter(Boolean)
      .map(N => new N());
  }

  /**
   * Quickly generate a rough draft response.
   * Only uses data from the provided hot cache to keep runtime low.
   *
   * @param {string} query - user query
   * @param {Object} [context] - optional context with hotCache array
   * @returns {Promise<{text: string, gaps: string[], confidence: number}>}
   */
  async generate(query, context = {}) {
    const start = Date.now();
    const hotCache = Array.isArray(context.hotCache) ? context.hotCache : [];

    let text = `Draft response for: ${query}\n`;
    const gaps = [];

    if (hotCache.length > 0) {
      // Use only a slice of the cache to avoid long processing times
      text += hotCache.slice(0, 3).join(' ');
    } else {
      const marker = '[[GAP]]';
      text += marker;
      gaps.push(marker);
    }

    const sample = hotCache[0] || query;
    const neuronOutputs = [];
    for (const neuron of this.neurons) {
      try {
        neuron.analyze(sample);
        neuronOutputs.push(neuron.generate({ text }));
      } catch {}
    }

    if (neuronOutputs.length) {
      text += `\n${neuronOutputs.join('\n')}`;
    }

    const confidence = 0.3; // initial drafts are low confidence

    // Ensure we finish well under 3 seconds
    const duration = Date.now() - start;
    if (duration > 3000) {
      throw new Error('Draft generation exceeded time limit');
    }

    return { text, gaps, confidence };
  }
}

module.exports = DraftGenerator;
