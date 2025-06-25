process.env.NO_GIT = "true";
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const index_manager = require('../logic/index_manager');

(async function run() {
  const idxPath = path.join(__dirname, '..', 'memory', 'lessons', 'index.json');
  const original = fs.readFileSync(idxPath, 'utf-8');
  const data = JSON.parse(original);
  data.files.push({ title: 'Bad', file: '../index.js' });
  data.files.push({ title: 'Missing', file: 'lessons/not_exists.md' });
  fs.writeFileSync(idxPath, JSON.stringify(data, null, 2), 'utf-8');

  await index_manager.loadIndex();
  const report = index_manager.getValidationReport();
  assert.ok(report.invalid.includes('index.js'));
  assert.ok(report.missing.includes('memory/lessons/not_exists.md'));

  const updated = JSON.parse(fs.readFileSync(idxPath, 'utf-8'));
  const files = updated.files.map(f => f.file);
  // invalid entry should be removed
  assert.ok(!files.includes('../index.js'));
  // missing file entry remains by default
  assert.ok(files.includes('lessons/not_exists.md'));

  fs.writeFileSync(idxPath, original, 'utf-8');
  console.log('index consistency test passed');
})();
