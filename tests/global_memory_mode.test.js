const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { getMemoryMode, setMemoryMode, configPath } = require('../src/memory_mode');

(async function run() {
  const dir = path.dirname(configPath);
  fs.rmSync(dir, { recursive: true, force: true });

  let mode = await getMemoryMode();
  assert.strictEqual(mode, 'github');

  await setMemoryMode('local');
  mode = await getMemoryMode();
  assert.strictEqual(mode, 'local');

  await setMemoryMode('github');
  mode = await getMemoryMode();
  assert.strictEqual(mode, 'github');

  fs.rmSync(dir, { recursive: true, force: true });
  console.log('global memory mode tests passed');
})();
