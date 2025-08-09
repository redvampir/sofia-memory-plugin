const MirrorNeuron = require('./MirrorNeuron');

/**
 * Neuron that mirrors sentence structure characteristics such as
 * sentence types and passive voice frequency.
 */
class StructureMirrorNeuron extends MirrorNeuron {
  /**
   * Analyze input text to capture sentence structure information.
   * @param {string} input
   * @returns {Object} stored structure parameters
   */
  analyze(input = '') {
    const baseStyle = super.analyze(input);
    const sentences = input.match(/[^.!?]+[.!?]/g) || [];
    const passiveRegex = /\b(be|am|is|are|was|were|been|being)\b\s+\w+ed\b/i;

    const counts = { declarative: 0, interrogative: 0, exclamatory: 0 };
    const order = [];
    let passiveCount = 0;

    sentences.forEach(s => {
      const trimmed = s.trim();
      const last = trimmed.slice(-1);
      let type;
      if (last === '?') {
        type = 'interrogative';
      } else if (last === '!') {
        type = 'exclamatory';
      } else {
        type = 'declarative';
      }
      counts[type]++;
      order.push(type);
      if (passiveRegex.test(trimmed)) passiveCount++;
    });

    const total = sentences.length || 1;
    this.style = {
      ...baseStyle,
      structure: counts,
      order,
      passiveRatio: passiveCount / total
    };
    return this.style;
  }

  /**
   * Generate sentences that mimic analyzed structure.
   * @param {Object} context - generation context (unused)
   * @returns {string} generated text
   */
  generate(context = {}) { // eslint-disable-line no-unused-vars
    const { order = [], passiveRatio = 0 } = this.style;
    const templates = {
      declarative: {
        active: 'The cat eats the food.',
        passive: 'The food is eaten by the cat.'
      },
      interrogative: {
        active: 'Does the cat eat the food?',
        passive: 'Is the food eaten by the cat?'
      },
      exclamatory: {
        active: 'The cat eats the food!',
        passive: 'The food is eaten by the cat!'
      }
    };

    const totalSentences = order.length;
    const passiveCount = Math.round(passiveRatio * totalSentences);
    let usedPassive = 0;
    const result = [];

    order.forEach(type => {
      const usePassive = usedPassive < passiveCount;
      result.push(templates[type][usePassive ? 'passive' : 'active']);
      if (usePassive) usedPassive++;
    });

    return this.mirror(result.join(' '));
  }
}

module.exports = StructureMirrorNeuron;
