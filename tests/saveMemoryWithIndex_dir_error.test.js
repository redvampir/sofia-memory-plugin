process.env.NO_GIT = "true";
const assert = require('assert');
const index_manager = require('../logic/index_manager');

(async function run(){
  let err = null;
  try {
    await index_manager.saveMemoryWithIndex(null, null, null, 'memory/', 'hi');
  } catch(e) {
    err = e;
  }
  assert.ok(err, 'expected error for directory path');
  assert.strictEqual(
    err.message,
    'saveMemory expects a file path, got directory: memory/'
  );
  console.log('saveMemoryWithIndex directory path test passed');
})();
