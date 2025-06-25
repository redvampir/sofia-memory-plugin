const fs = require('fs');
const path = require('path');
const assert = require('assert');
process.env.NO_INDEX_UPDATE = 'true';
const { migrateMemoryFile } = require('../tools/memory_migrator');

(async function run(){
  const dir = path.join(__dirname, '..', 'memory', 'tmp_migrate');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'legacy.md');
  fs.writeFileSync(file, '# Legacy\n\nSome text');
  const rel = path.relative(path.join(__dirname, '..'), file).replace(/\\/g,'/');
  await migrateMemoryFile(rel);
  const updated = fs.readFileSync(file, 'utf-8');
  assert.ok(updated.includes('version: 1.2'));
  assert.ok(updated.includes('<!-- START: content -->'));
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('memory migrator tests passed');
})();
