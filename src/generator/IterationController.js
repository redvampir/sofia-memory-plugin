const ResourceOptimizer = require('./ResourceOptimizer');

/**
 * Controls whether the iterative generation loop should continue.
 * It evaluates several factors such as iteration caps, quality targets,
 * remaining gaps in the response and overall time budget. Limits can be
 * influenced by the {@link ResourceOptimizer} which provides hardware
 * specific defaults.
 */
class IterationController {
  /**
     * @param {Object} [opts]
     * @param {number} [opts.iterationCap]  - maximum allowed iterations
     * @param {number} [opts.qualityTarget] - desired quality/confidence
     * @param {number} [opts.timeBudget]    - time budget in milliseconds
     * @param {ResourceOptimizer} [opts.resourceOptimizer]
     */
  constructor(opts = {}) {
    this.resourceOptimizer = opts.resourceOptimizer || new ResourceOptimizer();
    const hwConfig = this.resourceOptimizer.getConfig() || {};

    this.iterationCap =
      opts.iterationCap !== undefined ? opts.iterationCap : hwConfig.iterationCap || 5;
    this.qualityTarget =
      opts.qualityTarget !== undefined ? opts.qualityTarget : hwConfig.qualityTarget || 0.9;
    this.timeBudget =
      opts.timeBudget !== undefined ? opts.timeBudget : hwConfig.timeBudget || 10000;

    this.startTime = Date.now();
  }

  /**
   * Decide if another iteration should be executed.
   *
   * @param {Object|number} state - iteration state or iteration count for backwards compatibility
   * @param {number} [state.iteration] - current iteration number (0 based)
   * @param {number} [state.quality]   - current quality/confidence score (0-1)
   * @param {Array|number} [state.remainingGaps] - gaps still needing resolution
   * @param {number} [state.startTime] - time when iterations started
   * @returns {boolean} true if loop should continue
   */
  shouldContinue(state = {}, response, context) {
    // Backwards compatibility with old signature: (iteration, response, context)
    if (typeof state !== 'object') {
      state = { iteration: state };
    }

    const iteration = state.iteration || 0;
    const quality = state.quality || 0;
    const gaps = state.remainingGaps || state.gaps || [];
    const startTime = state.startTime || this.startTime;
    const gapCount = Array.isArray(gaps) ? gaps.length : gaps;

    // Update controller start time if provided in state
    this.startTime = startTime;

    const iterationOk = iteration < this.iterationCap;
    const timeOk = Date.now() - startTime < this.timeBudget;
    const qualityMet = quality >= this.qualityTarget;
    const gapsRemain = gapCount > 0;

    // Continue only if within limits AND (quality not met OR gaps remain)
    return iterationOk && timeOk && (!qualityMet || gapsRemain);
  }
}

module.exports = IterationController;
