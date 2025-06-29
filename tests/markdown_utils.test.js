const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { safeUpdateMarkdownChecklist } = require('../utils/markdown_utils');

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

  console.log('markdown_utils safe update tests passed');
})();
