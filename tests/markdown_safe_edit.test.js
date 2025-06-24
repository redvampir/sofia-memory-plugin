const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { editMarkdownFile, readMarkdownFile } = require('../tools/markdown_safe_edit');

const tmpDir = path.join(__dirname, 'tmp_safe');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

async function run() {
  const file = path.join(tmpDir, 'sample.md');
  fs.writeFileSync(file, '# Title\n\nText');
  const orig = readMarkdownFile(file);
  assert.ok(orig.includes('Title'));

  await editMarkdownFile(file, content => content + '\nMore', { autoConfirm: true });
  const updated = fs.readFileSync(file, 'utf-8');
  assert.ok(updated.includes('More'));

  const before = fs.readFileSync(file, 'utf-8');
  await editMarkdownFile(file, c => c + '\nExtra', { dryRun: true, autoConfirm: true });
  const after = fs.readFileSync(file, 'utf-8');
  assert.strictEqual(before, after);

  console.log('markdown safe edit tests passed');
}

run();
