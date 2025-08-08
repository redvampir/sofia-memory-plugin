process.env.NO_GIT = "true";
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const SessionSummarizer = require('../src/generator/summarization/SessionSummarizer');
const IterativeResponseGenerator = require('../src/generator/IterativeResponseGenerator');
const GapAnalyzer = require('../src/generator/analysis/GapAnalyzer');
const DeepSearcher = require('../src/generator/search/DeepSearcher');

class StubDraftGenerator {
  async generate(query, context) {
    return {
      text: `Stub draft [[REF:${context.ref}]]`,
      gaps: ['init'],
      confidence: 0.5,
    };
  }
}

class StubEnhancer {
  enhance(draft, results) {
    const additions = Array.isArray(results)
      ? results.map(r => r.content).join('\n')
      : '';
    return { text: draft + (additions ? '\n' + additions : ''), changes: [] };
  }
}

class StubController {
  shouldContinue(state) {
    const iter = typeof state === 'object' ? state.iteration : state;
    return iter < 1;
  }
}

(async function run() {
  const tempDir = path.join(__dirname, 'tmp_iterative');
  if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
  const summarizer = new SessionSummarizer({ memoryRoot: tempDir });

  const question = 'What is the meaning of life?';
  const answer = '42 is often cited as the answer to life, the universe, and everything.';
  const summary = summarizer.summarizePair(question, answer);
  const sessionId = 'iter-session';
  const { answerPath } = summarizer.storeSummary(sessionId, summary, question, answer);

  const generator = new IterativeResponseGenerator({
    draftGenerator: new StubDraftGenerator(),
    gapAnalyzer: new GapAnalyzer(),
    deepSearcher: new DeepSearcher({ sessionSummarizer: summarizer }),
    responseEnhancer: new StubEnhancer(),
    iterationController: new StubController(),
    sessionSummarizer: summarizer,
  });

  const context = { sessionId, ref: answerPath };
  const final = await generator.generateResponse('dummy', context);

  assert.ok(context.hotCache.includes(summary), 'summary loaded into hot cache');
  assert.ok(context.hotCache.includes(answer), 'full answer loaded into hot cache');
  assert.ok(context.usedFullTexts.includes(answerPath), 'full text reference recorded');
  assert.ok(final.includes(answer), 'final response includes full answer');

  fs.rmSync(tempDir, { recursive: true, force: true });
  console.log('iterative generation with summary test passed');
})();
