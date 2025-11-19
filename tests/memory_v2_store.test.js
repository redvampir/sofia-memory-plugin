const assert = require('assert');
const fs = require('fs');
const path = require('path');

const tempStore = path.join(__dirname, 'draft', 'memory_v2_store.json');
process.env.MEMORY_V2_STORE = tempStore;

const {
  upsertEntry,
  searchEntries,
  pickByScore,
} = require('../logic/memory_v2_store');

function cleanup() {
  if (fs.existsSync(tempStore)) fs.unlinkSync(tempStore);
}

function ensureDraftDir() {
  const dir = path.dirname(tempStore);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function countTokens(items) {
  return items.reduce((acc, item) => acc + (item.tokens || 0), 0);
}

try {
  ensureDraftDir();
  cleanup();

  const first = upsertEntry({
    type: 'note',
    project: 'alpha',
    content: 'Первый тестовый блок',
    tags: ['tests', 'alpha'],
    priority: 2,
    lang: 'ru',
  });
  assert.ok(first.id, 'идентификатор должен быть сгенерирован');

  const updated = upsertEntry({ ...first, deleted: true });
  assert.strictEqual(updated.deleted, true, 'должен быть soft-delete');

  const second = upsertEntry({
    type: 'note',
    project: 'beta',
    content: 'Второй блок для поиска',
    tags: ['beta'],
    priority: 3,
    lang: 'ru',
  });
  assert.ok(second.id !== first.id, 'идентификаторы различаются');

  const searchByTag = searchEntries({ tags: ['beta'] });
  assert.strictEqual(searchByTag.length, 1, 'ожидается одна запись по тегу beta');
  assert.strictEqual(searchByTag[0].project, 'beta');

  const context = pickByScore(searchEntries(), 10);
  assert.ok(context.items.length >= 1, 'должен вернуть хотя бы один элемент');
  assert.ok(countTokens(context.items) <= 10, 'токены не должны превышать бюджет');
} finally {
  cleanup();
}

console.log('memory_v2_store.test.js: ok');
