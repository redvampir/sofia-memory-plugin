process.env.NO_GIT = "true";
const assert = require('assert');
const { sort_by_priority } = require('../tools/index_utils');
const index_tree = require('../tools/index_tree');

(async function run() {
  // direct sort_by_priority with context_priority fallback
  const sample = [
    { title: 'low', context_priority: 'low' },
    { title: 'medium', context_priority: 'medium' },
    { title: 'high', context_priority: 'high' }
  ];
  const sorted = sort_by_priority(sample);
  const order = sorted.map(e => e.title);
  assert.deepStrictEqual(order, ['high', 'medium', 'low']);

  // ensure files from index tree are sorted with context_priority
  const loaded = sort_by_priority(index_tree.listAllEntries());
  const highestIndexInLoaded = loaded.findIndex(
    e => (e.context_priority || '').toLowerCase() !== 'high'
  );
  const firstNonHigh = highestIndexInLoaded >= 0 ? highestIndexInLoaded : loaded.length;
  const highCount = loaded.filter(
    e => (e.context_priority || '').toLowerCase() === 'high'
  ).length;
  assert.ok(firstNonHigh >= highCount, 'high priority entries should come first');

  console.log('index priority sort test passed');
})();
