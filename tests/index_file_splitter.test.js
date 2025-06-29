const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { splitIndexFile } = require('../utils/file_splitter');

const tmpDir = path.join(__dirname, 'tmp_index_split');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

(function run(){
  const idx = path.join(tmpDir, 'index.json');
  const data = { type: 'index-branch', category: 'tmp', files: [] };
  for(let i=0;i<50;i++) data.files.push({ file: `f${i}.md`, title: `T${i}` });
  fs.writeFileSync(idx, JSON.stringify(data, null, 2), 'utf8');

  const parts = splitIndexFile(idx, 1000);
  assert.ok(parts.length > 1, 'index should be split');
  parts.forEach(p => {
    assert.ok(fs.existsSync(p), `part ${p} exists`);
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
    assert.ok(Array.isArray(parsed.files));
  });

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('index file splitter tests passed');
})();
