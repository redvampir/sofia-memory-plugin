const assert = require('assert');
const DraftGenerator = require('../src/generator/draft/DraftGenerator');

(async function run() {
  const generator = new DraftGenerator();
  const start = Date.now();
  const result = await generator.generate('Explain AI');
  const duration = Date.now() - start;

  assert(duration < 3000, 'generation should be fast');
  assert(typeof result.text === 'string' && result.text.includes('[[GAP]]'), 'text includes gap marker');
  assert(Array.isArray(result.gaps) && result.gaps.length > 0, 'gaps array present');
  assert(result.confidence >= 0 && result.confidence <= 1, 'confidence within range');
  console.log('draft generator test passed');
})();
