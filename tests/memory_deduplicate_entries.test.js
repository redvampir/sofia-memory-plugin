process.env.NO_GIT = "true";
const assert = require('assert');
const { deduplicateEntries } = require('../logic/memory_operations');

(function run() {
  const entries = [
    { path: 'foo.md', title: 'First', lastModified: '2023-01-01T00:00:00Z' },
    { path: 'memory/foo.md', title: 'Second', lastModified: '2023-01-02T00:00:00Z' },
    { path: 'bar.md', title: 'Third', lastModified: '2023-01-01T00:00:00Z' }
  ];

  const result = deduplicateEntries(entries);
  assert.strictEqual(result.length, 2, 'should keep two unique entries');
  const foo = result.find(e => e.path === 'memory/foo.md');
  assert.ok(foo, 'foo entry kept');
  assert.strictEqual(foo.title, 'Second', 'newest entry kept by path');
  const bar = result.find(e => e.path === 'memory/bar.md');
  assert.ok(bar, 'bar entry kept');

  console.log('deduplicateEntries duplicate path test passed');
})();
