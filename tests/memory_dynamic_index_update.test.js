process.env.NO_GIT = "true";
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const storage = require('../src/storage');
const index_manager = require('../logic/index_manager');

(async function run(){
  const fileRel = 'memory/lessons/tmp_dynamic.md';
  const abs = path.join(__dirname,'..',fileRel);
  fs.mkdirSync(path.dirname(abs),{recursive:true});
  fs.writeFileSync(abs,'hello');

  await index_manager.loadIndex();
  let found = index_manager.getByPath(fileRel);
  assert.ok(!found);

  const content = await storage.read_memory(null,null,null,fileRel);
  assert.strictEqual(content,'hello');

  await index_manager.loadIndex();
  found = index_manager.getByPath(fileRel);
  assert.ok(found && found.path===fileRel);

  fs.rmSync(abs, { force: true });
  console.log('memory dynamic index update tests passed');
})();
