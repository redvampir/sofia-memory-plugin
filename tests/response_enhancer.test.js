const assert = require('assert');
const ResponseEnhancer = require('../src/generator/enhancement/ResponseEnhancer');

(async function run() {
  const enhancer = new ResponseEnhancer();
  const draft = 'Base draft';
  const results = [
    { directive: 'CONTEXT_ENRICHMENT', content: 'extra context' },
    { directive: 'CRITICAL_CORRECTION', content: 'fix critical error' },
    { directive: 'IMPORTANT_ADDITION', content: 'add important fact' }
  ];

  const out = enhancer.enhance(draft, results);

  assert.strictEqual(
    out.text,
    'Base draft\nCritical correction: fix critical error\nImportant addition: add important fact\nContext: extra context',
    'enhanced text should apply directives in priority order'
  );

  assert.deepStrictEqual(
    out.changes,
    [
      { directive: 'CRITICAL_CORRECTION', content: 'fix critical error' },
      { directive: 'IMPORTANT_ADDITION', content: 'add important fact' },
      { directive: 'CONTEXT_ENRICHMENT', content: 'extra context' }
    ],
    'changes should reflect applied directives'
  );

  // changelog accumulates
  assert.deepStrictEqual(enhancer.log, out.changes, 'log should record changes');

  // second enhancement to ensure history persists and output resets
  const out2 = enhancer.enhance('Next draft', [
    { directive: 'IMPORTANT_ADDITION', content: 'second addition' }
  ]);

  assert.strictEqual(
    out2.text,
    'Next draft\nImportant addition: second addition',
    'subsequent enhancements should work'
  );

  assert.deepStrictEqual(
    enhancer.log,
    [
      { directive: 'CRITICAL_CORRECTION', content: 'fix critical error' },
      { directive: 'IMPORTANT_ADDITION', content: 'add important fact' },
      { directive: 'CONTEXT_ENRICHMENT', content: 'extra context' },
      { directive: 'IMPORTANT_ADDITION', content: 'second addition' }
    ],
    'log should maintain history across enhancements'
  );

  console.log('response enhancer test passed');
})();
