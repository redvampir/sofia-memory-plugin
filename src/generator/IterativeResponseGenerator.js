const DraftGenerator = require('./draft/DraftGenerator');
const GapAnalyzer = require('./GapAnalyzer');
const DeepSearcher = require('./DeepSearcher');
const ResponseEnhancer = require('./ResponseEnhancer');
const IterationController = require('./IterationController');

/**
 * Coordinates iterative response generation. Each iteration:
 *  1. Analyze gaps in the current response.
 *  2. Search for additional information to fill those gaps.
 *  3. Enhance the response with newly discovered information.
 * Continues until the iteration controller signals to stop or
 * the gap analyzer finds no further issues.
 */
class IterativeResponseGenerator {
  /**
   * @param {Object} [opts]
   * @param {DraftGenerator} [opts.draftGenerator]
   * @param {GapAnalyzer} [opts.gapAnalyzer]
   * @param {DeepSearcher} [opts.deepSearcher]
   * @param {ResponseEnhancer} [opts.responseEnhancer]
   * @param {IterationController} [opts.iterationController]
   */
  constructor(opts = {}) {
    this.draftGenerator = opts.draftGenerator || new DraftGenerator();
    this.gapAnalyzer = opts.gapAnalyzer || new GapAnalyzer();
    this.deepSearcher = opts.deepSearcher || new DeepSearcher();
    this.responseEnhancer =
      opts.responseEnhancer || new ResponseEnhancer();
    this.iterationController =
      opts.iterationController || new IterationController();
  }

  /**
   * Generate a response for a query using iterative refinement.
   * @param {string} query User prompt
   * @param {Object} [context] Optional contextual data
   * @returns {Promise<string>} Final response text
   */
  async generateResponse(query, context = {}) {
    let response = await this.draftGenerator.generate(query, context);
    let iteration = 0;

    while (this.iterationController.shouldContinue(iteration, response, context)) {
      const gaps = await this.gapAnalyzer.analyze(response, query, context);
      if (!gaps || gaps.length === 0) break;
      const findings = await this.deepSearcher.search(gaps, query, context);
      response = await this.responseEnhancer.enhance(
        response,
        findings,
        query,
        context
      );
      iteration += 1;
    }

    return response;
  }
}

module.exports = IterativeResponseGenerator;
