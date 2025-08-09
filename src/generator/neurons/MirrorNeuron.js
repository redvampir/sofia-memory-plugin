const BaseNeuron = require('./BaseNeuron');

/**
 * Neuron that mirrors text using stored style parameters.
 */
class MirrorNeuron extends BaseNeuron {
  constructor() {
    super();
    this.style = {};
  }

  /**
   * Extract and store style information from the input text.
   * @param {string} input - sample text whose style should be mimicked
   * @returns {Object} stored style parameters
   */
  analyze(input = '') {
    this.style = {
      isUpper: input === input.toUpperCase() && input !== input.toLowerCase(),
      isLower: input === input.toLowerCase() && input !== input.toUpperCase(),
      lastChar: input.slice(-1)
    };
    return this.style;
  }

  /**
   * Generate mirrored text based on stored style.
   * @param {Object} context - generation context
   * @param {string} context.text - text to mirror
   * @returns {string} mirrored text
   */
  generate(context = {}) {
    const text = context.text || '';
    return this.mirror(text);
  }

  /**
   * Apply saved style parameters to the given text.
   * @param {string} text
   * @returns {string}
   */
  mirror(text = '') {
    let output = text;
    if (this.style.isUpper) {
      output = output.toUpperCase();
    } else if (this.style.isLower) {
      output = output.toLowerCase();
    }

    if (this.style.lastChar && output.slice(-1) !== this.style.lastChar) {
      output += this.style.lastChar;
    }
    return output;
  }
}

module.exports = MirrorNeuron;
