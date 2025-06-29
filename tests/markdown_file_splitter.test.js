const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { splitMarkdownFile, MAX_MD_FILE_SIZE } = require('../utils/file_splitter');

const tmpDir = path.join(__dirname, 'tmp_md_file_split');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

(function run(){
  const src = path.join(tmpDir, 'big.md');
  const line = '# Heading\n\nSome text here\n';
  const repeat = Math.ceil((MAX_MD_FILE_SIZE + 1024) / Buffer.byteLength(line));
  fs.writeFileSync(src, line.repeat(repeat), 'utf-8');

  const parts = splitMarkdownFile(src);
  assert.ok(parts.length > 1, 'file should be split');
  parts.forEach(p => {
    assert.ok(fs.existsSync(p), `part ${p} exists`);
    const sz = fs.statSync(p).size;
    assert.ok(sz <= MAX_MD_FILE_SIZE, 'part within size limit');
  });

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('markdown file splitter tests passed');
})();
