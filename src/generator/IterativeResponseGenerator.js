const DraftGenerator = require('./draft/DraftGenerator');
const GapAnalyzer = require('./analysis/GapAnalyzer');
const DeepSearcher = require('./search/DeepSearcher');
const ResponseEnhancer = require('./enhancement/ResponseEnhancer');
const IterationController = require('./IterationController');
const SessionSummarizer = require('./summarization/SessionSummarizer');

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
    this.sessionSummarizer =
      opts.sessionSummarizer || new SessionSummarizer();
  }

  /**
   * Generate a response for a query using iterative refinement.
   * @param {string} query User prompt
   * @param {Object} [context] Optional contextual data
   * @returns {Promise<string>} Final response text
   */
  async generateResponse(query, context = {}) {
    context.hotCache = Array.isArray(context.hotCache) ? context.hotCache : [];
    context.usedFullTexts = Array.isArray(context.usedFullTexts)
      ? context.usedFullTexts
      : [];

    if (context.sessionId) {
      const summary = this.sessionSummarizer.getSummary(context.sessionId);
      if (summary) context.hotCache.push(summary);
    }

    let response = await this.draftGenerator.generate(query, context);
    let iteration = 0;

    while (this.iterationController.shouldContinue(iteration, response, context)) {
      const analysis = await this.gapAnalyzer.analyze(response, query, context);
      const refIds = analysis && analysis.referenceIds ? analysis.referenceIds : [];
      if (
        !analysis ||
        (!analysis.uncertainties.length &&
          !analysis.undefinedTerms.length &&
          !analysis.missingReferences.length &&
          refIds.length === 0)
      )
        break;

      const findings = await this.deepSearcher.search(query, refIds, context);
      const enhanced = await this.responseEnhancer.enhance(
        response,
        findings,
        context
      );
      response = enhanced.text || enhanced;
      iteration += 1;
    }

    return response;
  }
}

module.exports = IterativeResponseGenerator;
