const fs = require('fs');
const path = require('path');
const assert = require('assert');
process.env.NO_INDEX_UPDATE = 'true';
const { split_memory_file } = require('../tools/memory_splitter');
const { readMemory } = require('../src/memory');
const index_manager = require('../logic/index_manager');
const { setMemoryMode } = require('../utils/memory_mode');

const tmp_dir = path.join(__dirname, '..', 'memory', 'tmp_split');
if (!fs.existsSync(tmp_dir)) fs.mkdirSync(tmp_dir, { recursive: true });

async function run(){
  await setMemoryMode('default', 'github');
  const rel = 'memory/tmp_split/long.md';
  const abs = path.join(__dirname, '..', rel);
  const parts = [];
  for(let i=0;i<30;i++) parts.push('word'.repeat(1));
  const content = '# Long\n\n' + parts.map(w=>w+' '+w+' '+w).join('\n\n');
  fs.writeFileSync(abs, content);

  const result = await split_memory_file(rel, 10);
  assert.ok(result.length > 1);
  const backup_path = abs + '.bak';
  assert.ok(fs.existsSync(backup_path));
  const index_path = path.join(__dirname, '..', 'memory', 'tmp_split', 'long', 'index.md');
  assert.ok(fs.existsSync(index_path));

  const read = await readMemory(null, null, rel);
  assert.ok(read.includes('word word'));

  fs.rmSync(path.join(__dirname, '..', 'memory', 'tmp_split'), { recursive: true, force: true });
  fs.rmSync(backup_path, { force: true });
  await index_manager.removeEntry('memory/tmp_split/long/index.md');
  await index_manager.saveIndex();
  await setMemoryMode('default', 'github');
  console.log('memory split tests passed');
}

run();
