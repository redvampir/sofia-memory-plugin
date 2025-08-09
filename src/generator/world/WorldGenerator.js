const fs = require('fs');
const path = require('path');
const availableNeurons = require('../neurons');

const STATE_TO_CLASS = {
  style: 'StyleMirrorNeuron',
  emotion: 'EmotionMirrorNeuron',
  structure: 'StructureMirrorNeuron'
};

/**
 * Generator responsible for building a world description.
 * It can incorporate previously saved mirror neuron states if available.
 */
class WorldGenerator {
  constructor(opts = {}) {
    this.neurons = [];
    this.baseSettings = opts.baseSettings || {};
  }

  /**
   * Prepare generation context and load mirror neurons if a path is provided.
   *
   * @param {Object} context
   * @param {string} [context.mirrorNeuronsPath] - path to saved neuron state
   * @returns {Object} the original context
   */
  prepareContext(context = {}) {
    const p = context.mirrorNeuronsPath;
    this.neurons = [];

    if (p) {
      const abs = path.resolve(p);
      if (fs.existsSync(abs)) {
        try {
          const raw = fs.readFileSync(abs, 'utf8');
          const data = JSON.parse(raw);
          for (const [key, state] of Object.entries(data || {})) {
            const clsName = STATE_TO_CLASS[key];
            const Neuron = availableNeurons[clsName];
            if (Neuron && state) {
              const n = new Neuron();
              n.style = state;
              if (key === 'emotion' && state.emotion) {
                n.emotion = state.emotion;
              }
              this.neurons.push(n);
            }
          }
        } catch (e) {
          // ignore parse errors and fall back to base settings
          this.neurons = [];
        }
      }
    }

    return context;
  }

  /**
   * Generate world data. Before finalizing the world, each loaded neuron
   * will generate using the provided context.
   * Fallback to base settings if no neurons are loaded.
   *
   * @param {Object} context
   * @returns {Object} world description
   */
  generate(context = {}) {
    const world = { ...(context.baseWorld || this.baseSettings) };

    if (!this.neurons.length) {
      return world;
    }

    const outputs = [];
    for (const neuron of this.neurons) {
      try {
        outputs.push(neuron.generate(context));
      } catch (_) {
        // ignore individual neuron errors
      }
    }

    if (outputs.length) {
      world.mirrorNeurons = outputs;
    }

    return world;
  }
}

module.exports = WorldGenerator;
