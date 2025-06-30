process.env.NO_GIT = "true";
const assert = require('assert');
const { filterMemoryFiles } = require('../tools/index_utils');

(function run() {
  const files = [
    { category: 'lessons', tags: ['intro'], path: 'memory/lessons/intro.md' },
    { category: 'notes', tags: ['js'], path: 'memory/notes/js.md' },
    { category: 'lessons', tags: ['advanced'], path: 'memory/lessons/adv.md' }
  ];

  let result = filterMemoryFiles(files, { category: 'lessons' });
  assert.strictEqual(result.length, 2, 'filter by category');

  result = filterMemoryFiles(files, { topic: 'js' });
  assert.strictEqual(result.length, 1, 'filter by tag');
  assert.strictEqual(result[0].path, 'memory/notes/js.md');

  result = filterMemoryFiles(files, { category: 'plans', topic: 'intro' });
  assert.strictEqual(result.length, 1, 'category or tag');
  assert.strictEqual(result[0].path, 'memory/lessons/intro.md');

  result = filterMemoryFiles(files, { category: 'plans', topic: 'none' });
  assert.strictEqual(result.length, 0, 'no matches');

  console.log('memory filter tests passed');
})();
