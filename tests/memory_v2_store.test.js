const assert = require('assert');
const fs = require('fs');
const path = require('path');

const tempStore = path.join(__dirname, 'draft', 'memory_v2_store.json');
process.env.MEMORY_V2_STORE = tempStore;
process.env.MAX_STORE_TOKENS = '1000';

const {
  upsertEntry,
  searchEntries,
  pickByScore,
  readStore,
} = require('../logic/memory_v2_store');

function cleanupBackups() {
  const dir = path.dirname(tempStore);
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir)
    .filter(f => f.startsWith('memory_v2_store.json.') && f.endsWith('.bak'))
    .forEach(f => fs.unlinkSync(path.join(dir, f)));
}

function cleanup() {
  if (fs.existsSync(tempStore)) fs.unlinkSync(tempStore);
  cleanupBackups();
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

  const originalMaxTokens = process.env.MAX_STORE_TOKENS;
  process.env.MAX_STORE_TOKENS = '10';
  try {
    assert.throws(
      () =>
        upsertEntry({
          type: 'note',
          project: 'beta',
          content: 'x'.repeat(64),
        }),
      err => {
        assert.strictEqual(err.statusCode, 413, 'ошибка должна быть с кодом 413');
        assert.strictEqual(err.code, 'MEMORY_ENTRY_TOO_LARGE', 'должен быть код ошибки MEMORY_ENTRY_TOO_LARGE');
        return true;
      },
      'слишком длинный контент должен отклоняться',
    );
  } finally {
    process.env.MAX_STORE_TOKENS = originalMaxTokens;
  }

  cleanup();
  ensureDraftDir();
  fs.writeFileSync(tempStore, '{ invalid json');

  assert.throws(
    () => readStore(),
    err => {
      assert.strictEqual(err.code, 'MEMORY_STORE_READ_ERROR');
      assert.strictEqual(err.statusCode, 500);
      return true;
    },
    'повреждённый JSON должен приводить к ошибке',
  );

  const backups = fs
    .readdirSync(path.dirname(tempStore))
    .filter(f => f.startsWith('memory_v2_store.json.') && f.endsWith('.bak'));
  assert.ok(backups.length >= 1, 'резервная копия должна быть создана');
} finally {
  cleanup();
}

console.log('memory_v2_store.test.js: ok');
