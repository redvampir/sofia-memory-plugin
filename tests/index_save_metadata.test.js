process.env.NO_GIT = "true";
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const index_manager = require('../logic/index_manager');

(async function run() {
  const idxPath = path.join(__dirname, '..', 'memory', 'plans', 'index.json');
  const original = fs.readFileSync(idxPath, 'utf-8');

  await index_manager.loadIndex();
  await index_manager.addOrUpdateEntry({
    path: 'memory/plans/features/limit_guard.md',
    priority: 'high',
    version: '1.2.3'
  });

  const data = JSON.parse(fs.readFileSync(idxPath, 'utf-8'));
  const entry = data.files.find(f => f.file === 'plans/features/limit_guard.md');
  assert.ok(entry, 'entry exists');
  assert.strictEqual(entry.priority, 'high');
  assert.strictEqual(entry.version, '1.2.3');
  assert.ok(entry.lastModified);
  assert.ok(entry.context_priority);

  fs.writeFileSync(idxPath, original, 'utf-8');
  await index_manager.loadIndex();
  console.log('index save metadata test passed');
})();
