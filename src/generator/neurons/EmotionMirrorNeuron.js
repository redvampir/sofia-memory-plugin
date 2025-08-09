const MirrorNeuron = require('./MirrorNeuron');

/**
 * Neuron that mirrors emotional tone from input text.
 */
class EmotionMirrorNeuron extends MirrorNeuron {
  constructor() {
    super();
    this.emotion = 'neutral';
  }

  /**
   * Analyze input text to detect simple emotional tone.
   * @param {string} input - sample text whose emotion should be mirrored
   * @returns {Object} stored style parameters including emotion
   */
  analyze(input = '') {
    const style = super.analyze(input);
    const lower = input.toLowerCase();
    const dictionary = {
      happy: ['happy', 'joy', 'glad', 'excited', 'love'],
      sad: ['sad', 'down', 'unhappy', 'depressed', 'cry'],
      angry: ['angry', 'mad', 'furious', 'irritated', 'hate']
    };

    this.emotion = 'neutral';
    for (const [emotion, words] of Object.entries(dictionary)) {
      if (words.some(w => lower.includes(w))) {
        this.emotion = emotion;
        break;
      }
    }

    return { ...style, emotion: this.emotion };
  }

  /**
   * Generate text with mirrored emotion.
   * @param {Object} context - generation context
   * @param {string} context.text - base text to mirror
   * @returns {string} emotion-enhanced text
   */
  generate(context = {}) {
    const base = super.generate(context);
    const additions = {
      happy: ' Yay! 😊',
      sad: ' Oh no... 😢',
      angry: ' Grr! 😠'
    };
    return base + (additions[this.emotion] || '');
  }
}

module.exports = EmotionMirrorNeuron;
