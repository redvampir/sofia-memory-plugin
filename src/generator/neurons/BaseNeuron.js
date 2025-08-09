/**
 * Abstract base class for generator neurons.
 * Provides interface for analysis and generation.
 */
class BaseNeuron {
  /**
   * Analyze the given input and update internal state.
   * @abstract
   * @param {*} input - data to analyze
   */
  analyze(input) {
    throw new Error('analyze() must be implemented by subclasses');
  }

  /**
   * Generate output based on provided context.
   * @abstract
   * @param {*} context - generation context
   */
  generate(context) {
    throw new Error('generate() must be implemented by subclasses');
  }
}

module.exports = BaseNeuron;
