process.env.NO_GIT = "true";
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { auto_recover_context, load_memory_to_context, setMemoryRepo } = require('../src/memory');
const { contextFilename } = require('../logic/memory_operations');

async function run() {
  await setMemoryRepo(null, null);
  const rel = 'memory/lessons/tmp_recover.md';
  const abs = path.join(__dirname, '..', rel);
  const data = ['---','context_priority: high','---','Temp'].join('\n');
  fs.writeFileSync(abs, data);

  const res = await auto_recover_context();
  assert.ok(res && res.files.includes(rel));
  assert.ok(fs.readFileSync(contextFilename, 'utf-8').includes('Temp'));

  const manual = await load_memory_to_context(rel);
  assert.ok(manual.tokens >= 1);

  // cleanup
  // note: file kept to avoid race with async index rebuild
  fs.writeFileSync(contextFilename, '');
  console.log('context recovery tests passed');
}

run();
