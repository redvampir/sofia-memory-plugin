const assert = require('assert');
const { deduplicateTasks } = require('../utils/markdown_utils');

(function run(){
  const existing = ['- [x] Добавить поддержку index.json'];
  const newer = ['- [ ] Добавить поддержку index.json', '- [ ] Новая задача'];
  const result = deduplicateTasks(existing, newer);
  assert.deepStrictEqual(result, ['- [ ] Новая задача']);
  console.log('deduplicateTasks test passed');
})();
