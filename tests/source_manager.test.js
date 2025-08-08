process.env.NO_GIT = "true";
const assert = require('assert');
const { SourceManager, SOURCE_RELIABILITY, calculateSourceLimit } = require('../src/sources/SourceManager');

(function reliabilityHierarchy() {
  assert.ok(SOURCE_RELIABILITY.HIGH > SOURCE_RELIABILITY.MEDIUM);
  assert.ok(SOURCE_RELIABILITY.MEDIUM > SOURCE_RELIABILITY.LOW);
})();

(function limitCalculation() {
  const high = calculateSourceLimit({ baseLimit: 12, reliability: 'high' });
  const low = calculateSourceLimit({ baseLimit: 12, reliability: 'low' });
  assert.ok(high > low, 'high reliability should have higher limit');
})();

(function dedupAndPriority() {
  const mgr = new SourceManager();
  mgr.addSource('s1', 'high', [
    { content: 'alpha' },
    { content: 'beta' }
  ]);
  mgr.addSource('s2', 'low', [
    { content: 'alpha' },
    { content: 'gamma' },
    { content: 'delta' }
  ]);
  const merged = mgr.merge();
  const alphaEntries = merged.filter(e => e.content === 'alpha');
  assert.strictEqual(alphaEntries.length, 1, 'duplicate kept once');
  assert.strictEqual(alphaEntries[0].source, 's1', 'high reliability source kept duplicate');
  const sources = new Set(merged.map(e => e.source));
  assert.ok(sources.has('s1')); // high source kept
  assert.ok(sources.has('s2')); // low source still has >30% unique
})();

(function uniqueThreshold() {
  const mgr = new SourceManager();
  mgr.addSource('main', 'high', [
    { content: 'x' },
    { content: 'y' },
    { content: 'z' }
  ]);
  mgr.addSource('spam', 'low', [
    { content: 'x' },
    { content: 'y' },
    { content: 'z' },
    { content: 'x' }
  ]);
  const merged = mgr.merge();
  const sources = new Set(merged.map(e => e.source));
  assert.ok(!sources.has('spam'), 'source with <30% unique content removed');
})();

console.log('source_manager tests passed');
