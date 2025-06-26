process.env.NO_GIT = "true";
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const index_manager = require('../logic/index_manager');
const index_tree = require('../tools/index_tree');

(async function run() {
  const old_rel = 'memory/lessons/intro.md';
  const new_rel = 'memory/lessons/tmp_move/intro.md';
  const old_abs = path.join(__dirname, '..', old_rel);
  const new_abs = path.join(__dirname, '..', new_rel);
  const idx_path = path.join(__dirname, '..', 'memory', 'lessons', 'index.json');
  const original_idx = fs.readFileSync(idx_path, 'utf-8');

  await index_manager.moveFileAndUpdateIndex(old_rel, new_rel);
  assert.ok(fs.existsSync(new_abs));
  assert.ok(!fs.existsSync(old_abs));
  const moved = index_tree.findEntryByPath(new_rel);
  assert.ok(moved && moved.path === new_rel);

  await index_manager.moveFileAndUpdateIndex(new_rel, old_rel);
  assert.ok(fs.existsSync(old_abs));

  fs.rmSync(path.dirname(new_abs), { recursive: true, force: true });
  fs.writeFileSync(idx_path, original_idx, 'utf-8');
  await index_manager.loadIndex();

  console.log('move file update index tests passed');
})();

