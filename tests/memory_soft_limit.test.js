process.env.NO_GIT = "true";
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { saveMemory } = require('../memory');
const settings = require('../tools/memory_settings');

async function run() {
  const rel = 'memory/tmp_memory/soft_limit.md';
  const abs = path.join(__dirname, '..', rel);
  const tokens = settings.token_soft_limit + 10;
  const content = Array(tokens).fill('word').join(' ');

  const result = await saveMemory(null, null, rel, content);
  assert.ok(result.warning, 'Expected warning when exceeding soft limit');
  assert.ok(!fs.existsSync(abs), 'File should not be created when over limit');
  fs.rmSync(path.join(__dirname, '..', 'memory', 'tmp_memory'), { recursive: true, force: true });
  console.log('memory soft limit guard ok');
}

run();
