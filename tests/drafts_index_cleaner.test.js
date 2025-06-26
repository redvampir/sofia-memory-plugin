process.env.NO_GIT = "true";
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { cleanDraftsIndex } = require('../tools/drafts_index_cleaner');

(function run(){
  const idxPath = path.join(__dirname, '..', 'memory', 'drafts', 'index.json');
  const draftsDir = path.join(__dirname, '..', 'memory', 'drafts');
  const original = fs.readFileSync(idxPath, 'utf-8');

  // prepare test files
  fs.writeFileSync(path.join(draftsDir, 'a.md'), 'A');
  fs.writeFileSync(path.join(draftsDir, 'b.md'), 'B');

  const data = JSON.parse(original);
  data.files.push({title:'A1', file:'drafts/a.md'});
  data.files.push({title:'Duplicate', file:'drafts/a.md'});
  data.files.push({title:'B', file:'drafts/b.md'});
  data.files.push({title:'Missing', file:'drafts/missing.md'});
  fs.writeFileSync(idxPath, JSON.stringify(data, null, 2), 'utf-8');

  cleanDraftsIndex();

  const cleaned = JSON.parse(fs.readFileSync(idxPath, 'utf-8'));
  const files = cleaned.files.map(e => e.file);
  assert.ok(files.includes('drafts/a.md'), 'a.md kept');
  assert.ok(files.includes('drafts/b.md'), 'b.md kept');
  assert.ok(!files.includes('drafts/missing.md'), 'missing removed');
  assert.strictEqual(files.filter(f => f === 'drafts/a.md').length, 1, 'duplicates removed');

  // cleanup
  fs.writeFileSync(idxPath, original, 'utf-8');
  fs.unlinkSync(path.join(draftsDir, 'a.md'));
  fs.unlinkSync(path.join(draftsDir, 'b.md'));

  console.log('drafts index cleaner test passed');
})();
