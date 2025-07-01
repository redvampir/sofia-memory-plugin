process.env.NO_GIT = "true";
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const index_manager = require('../logic/index_manager');

(async function run() {
  const rootIdx = path.join(__dirname, '..', 'memory', 'index.json');
  const origRoot = fs.readFileSync(rootIdx, 'utf-8');

  const rel = 'memory/tmp_save/test_save.md';
  const abs = path.join(__dirname, '..', rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });

  const content = 'Hello world';
  const result = await index_manager.saveMemoryWithIndex(null, null, null, rel, content);
  assert.strictEqual(typeof result, 'string', 'should return path string');

  const saved = fs.readFileSync(abs, 'utf-8');
  assert.strictEqual(saved, content);

  fs.rmSync(path.dirname(abs), { recursive: true, force: true });
  fs.writeFileSync(rootIdx, origRoot, 'utf-8');
  await index_manager.loadIndex();

  console.log('saveMemoryWithIndex no split test passed');
})();
