const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { splitFile } = require('../utils/file_splitter');

const tmpDir = path.join(__dirname, 'tmp_file_split');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

(async function run(){
  const src = path.join(tmpDir, 'big.txt');
  fs.writeFileSync(src, 'a'.repeat(2500));

  const parts = await splitFile(src, 1000);
  assert.ok(parts.length > 1, 'file should be split');
  parts.forEach(p => assert.ok(fs.existsSync(p), `part ${p} exists`));

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('file splitter tests passed');
})();
