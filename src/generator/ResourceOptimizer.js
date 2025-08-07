const os = require('os');

/**
 * Simple heuristic based on available CPUs to adjust iteration caps and time budgets.
 * In a real implementation this would take into account more metrics like memory,
 * GPU availability, etc. For our purposes, we expose a `getConfig` method returning
 * an object that can contain `iterationCap` and `timeBudget` values.
 */
class ResourceOptimizer {
  constructor(opts = {}) {
    this.opts = opts;
  }

  /**
   * Determine configuration values based on the host hardware.
   * @returns {{iterationCap?: number, timeBudget?: number}}
   */
  getConfig() {
    const cores = os.cpus ? os.cpus().length : 1;

    // Very small machines get conservative limits.
    if (cores <= 2) {
      return { iterationCap: 3, timeBudget: 5000 };
    }

    // Moderate machines can handle a few more iterations and time.
    if (cores <= 4) {
      return { iterationCap: 5, timeBudget: 8000 };
    }

    // Larger machines are allowed even more work.
    return { iterationCap: 8, timeBudget: 12000 };
  }
}

module.exports = ResourceOptimizer;
