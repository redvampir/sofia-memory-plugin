const fs = require('fs');
const path = require('path');
const assert = require('assert');
const {
  safeUpdateMarkdownChecklist,
  generateMarkdownTOC,
  insertTOCInMarkdownFile,
} = require('../utils/markdown_utils');

const tmpDir = path.join(__dirname, 'tmp_md_utils');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

(async function run(){
  const file = path.join(tmpDir, 'list.md');
  if (fs.existsSync(file)) fs.unlinkSync(file);

  // create new file with one task
  await safeUpdateMarkdownChecklist(file, 'todo', ['- [ ] one']);
  let text = fs.readFileSync(file, 'utf-8');
  assert.ok(text.includes('- [ ] one'), 'task written');

  // update existing block with additional task and duplicate
  await safeUpdateMarkdownChecklist(file, 'todo', ['- [ ] two', '- [ ] one']);
  text = fs.readFileSync(file, 'utf-8');
  assert.ok(text.includes('- [ ] two'), 'new task added');
  assert.strictEqual((text.match(/- \[ \] one/g) || []).length, 1, 'no duplicate');

  // change status and revert
  await safeUpdateMarkdownChecklist(file, 'todo', ['- [x] two']);
  text = fs.readFileSync(file, 'utf-8');
  assert.ok(text.includes('- [x] two'), 'status updated');
  await safeUpdateMarkdownChecklist(file, 'todo', ['- [ ] two']);
  text = fs.readFileSync(file, 'utf-8');
  assert.ok(text.includes('- [ ] two'), 'status reverted');

  console.log('markdown_utils safe update tests passed');
})();

(async function runTOC(){
  const tocDir = path.join(tmpDir, 'toc');
  if (!fs.existsSync(tocDir)) fs.mkdirSync(tocDir);

  const mdPath = path.join(tocDir, 'lesson.md');
  const content = [
    '# Lesson',
    '',
    '## Что такое переменные',
    'text',
    '### Example',
    'code',
    '## End'
  ].join('\n');
  fs.writeFileSync(mdPath, content, 'utf-8');

  // anchor insertion
  const anchorPath = path.join(tocDir, 'anchor.md');
  fs.writeFileSync(anchorPath, '# T\n\n<!-- TOC -->\n\n## A');

  const tocString = generateMarkdownTOC(content);
  assert.ok(tocString.includes('- [Что такое переменные](#что-такое-переменные)'));

  await insertTOCInMarkdownFile(anchorPath);
  let txt = fs.readFileSync(anchorPath, 'utf-8');
  assert.ok(txt.includes('## Оглавление'), 'toc inserted at anchor');
  assert.ok(!txt.includes('<!-- TOC -->'), 'anchor removed');

  // insertion after heading and no duplicate
  await insertTOCInMarkdownFile(mdPath, { useTOCAnchor: false });
  txt = fs.readFileSync(mdPath, 'utf-8');
  assert.strictEqual((txt.match(/## Оглавление/g) || []).length, 1);

  await insertTOCInMarkdownFile(mdPath, { useTOCAnchor: false });
  txt = fs.readFileSync(mdPath, 'utf-8');
  assert.strictEqual((txt.match(/## Оглавление/g) || []).length, 1, 'no duplicate');

  console.log('markdown_utils toc tests passed');
})();
