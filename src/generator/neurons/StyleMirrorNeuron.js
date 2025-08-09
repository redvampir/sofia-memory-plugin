const MirrorNeuron = require('./MirrorNeuron');

/**
 * Neuron that mirrors high level writing style characteristics.
 * Captures average sentence length, punctuation frequency and formality.
 */
class StyleMirrorNeuron extends MirrorNeuron {
  /**
   * Analyze the given text and extract style parameters.
   * @param {string} input
   * @returns {{avgSentenceLength:number, punctuationFrequency:number, formality:string}}
   */
  analyze(input = '') {
    const sentences = input
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(Boolean);

    const wordCounts = sentences.map(s => s.split(/\s+/).filter(Boolean).length);
    const totalWords = wordCounts.reduce((a, b) => a + b, 0);
    const avgSentenceLength = sentences.length ? totalWords / sentences.length : 0;

    const words = input.split(/\s+/).filter(Boolean);
    const punctuationMatches = input.match(/[.,!?:;]/g) || [];
    const punctuationFrequency = words.length ? punctuationMatches.length / words.length : 0;

    const contractions = input.match(/\b\w+'[a-zA-Z]+\b/g) || [];
    const formality = contractions.length / (words.length || 1) > 0.05 ? 'informal' : 'formal';

    this.style = { avgSentenceLength, punctuationFrequency, formality };
    return this.style;
  }

  /**
   * Generate text using stored style parameters.
   * @param {Object} context - generation context (unused)
   * @returns {string} styled text
   */
  generate(context = {}) {
    const { avgSentenceLength = 10, punctuationFrequency = 0.1, formality = 'formal' } = this.style;

    const baseFormal = 'This is a formal sentence';
    const baseInformal = 'Hey this is an informal sentence';
    const base = formality === 'informal' ? baseInformal : baseFormal;

    const words = base.split(/\s+/);
    const targetLength = Math.round(avgSentenceLength);
    while (words.length < targetLength) {
      words.push(formality === 'informal' ? 'really' : 'indeed');
    }
    let sentence = words.join(' ');
    sentence += punctuationFrequency > 0.2 ? '!' : '.';
    return sentence;
  }
}

module.exports = StyleMirrorNeuron;
