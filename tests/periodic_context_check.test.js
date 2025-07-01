process.env.NO_GIT = "true";
const fs = require('fs');
const assert = require('assert');
const router = require('../api/memory_routes');
const restore_utils = require('../utils/restore_context');
const { contextFilename } = require('../logic/memory_operations');

(async function run(){
  fs.writeFileSync(contextFilename(), '');
  const origRestore = restore_utils.restoreContext;
  let called = false;
  restore_utils.restoreContext = async (id) => { called = id === 'testUser'; };
  await router._check_context_for_user('testUser');
  restore_utils.restoreContext = origRestore;
  fs.writeFileSync(contextFilename(), '');
  assert.ok(called, 'restoreContext should be called when context missing');
  console.log('periodic context check test passed');
})();
