const assert = require('assert');
const GapAnalyzer = require('../src/generator/analysis/GapAnalyzer');

(async function run(){
  const analyzer = new GapAnalyzer();
  const draft = `The result is maybe correct.\nWe will finalize <FooBar> later.\nAccording to experts this method works.`;
  const res = analyzer.analyze(draft);
  assert(Array.isArray(res.uncertainties) && res.uncertainties.length === 1, 'detects uncertainties');
  assert(res.uncertainties[0].priority > 0, 'uncertainty has priority');
  assert(Array.isArray(res.undefinedTerms) && res.undefinedTerms.length === 1, 'detects undefined terms');
  assert(res.undefinedTerms[0].term.includes('<FooBar>'), 'undefined term captured');
  assert(Array.isArray(res.missingReferences) && res.missingReferences.length === 1, 'detects missing references');
  assert(res.missingReferences[0].priority > 0, 'missing reference has priority');
  console.log('gap analyzer test passed');
})();
