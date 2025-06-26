process.env.NO_GIT = "true";
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const index_manager = require('../logic/index_manager');

(async function run() {
  const idxPath = path.join(__dirname, '..', 'memory', 'lessons', 'index.json');
  const original = fs.readFileSync(idxPath, 'utf-8');

  const check = await index_manager.validateFilePathAgainstIndex('memory/lesson_04.md');
  assert.ok(!check.valid);
  assert.ok(check.expectedPath.includes('04_example.md'));

  const newPath = await index_manager.getLessonPath(7);
  assert.strictEqual(newPath, 'memory/lessons/lesson_07.md');
  const idx = JSON.parse(fs.readFileSync(idxPath, 'utf-8'));
  assert.ok(idx.files.find(e => path.posix.join('memory', e.file) === newPath));

  // cleanup
  fs.writeFileSync(idxPath, original, 'utf-8');
  await index_manager.loadIndex();
  console.log('index manager validation passed');
})();
