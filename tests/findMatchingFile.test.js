process.env.NO_GIT = "true";
const assert = require('assert');
const { findMatchingFile } = require('../tools/index_utils');

(function run() {
  const index = {
    files: [
      {
        title: 'Введение в переменные',
        file: 'lesson_variables.md',
        tags: ['переменные', 'начало', 'значения'],
        aliases: ['variables', 'перем'],
        priority: 'high'
      },
      {
        title: 'Условные операторы',
        file: 'lesson_if.md',
        tags: ['условия'],
        aliases: ['if'],
        priority: 'medium'
      }
    ]
  };

  let matches = findMatchingFile(index, 'перем');
  assert.strictEqual(matches.length, 1, 'alias partial match');
  assert.strictEqual(matches[0].file, 'lesson_variables.md');

  matches = findMatchingFile(index, 'variables');
  assert.strictEqual(matches.length, 1, 'alias exact match');
  assert.strictEqual(matches[0].file, 'lesson_variables.md');

  matches = findMatchingFile(index, 'if');
  assert.strictEqual(matches[0].file, 'lesson_if.md', 'search by alias');

  matches = findMatchingFile(index, 'notfound');
  assert.strictEqual(matches.length, 0, 'no results');

  const index2 = {
    files: [
      { title: 'A', file: 'a.md', tags: ['tag'], aliases: [], priority: 'low' },
      { title: 'B', file: 'b.md', tags: ['tag'], aliases: [], priority: 'high' }
    ]
  };
  matches = findMatchingFile(index2, 'tag');
  assert.strictEqual(matches[0].file, 'b.md', 'sorted by priority');

  console.log('findMatchingFile tests passed');
})();
