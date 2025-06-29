const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { safeUpdateMarkdownChecklist } = require('../utils/markdown_utils');

const tmpDir = path.join(__dirname, 'tmp_safe_update');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

(function run(){
  const file = path.join(tmpDir, 'list.md');
  const initial = [
    '# Tasks',
    '',
    '<!-- START: todo -->',
    '- [ ] a',
    '- [ ] b',
    '<!-- END: todo -->',
    ''
  ].join('\n');
  fs.writeFileSync(file, initial);

  safeUpdateMarkdownChecklist(file, 'todo', ['- [ ] c', '- [ ] a']);
  let text = fs.readFileSync(file, 'utf-8');
  assert.strictEqual((text.match(/- \[ \] a/g) || []).length, 1);
  assert.strictEqual((text.match(/- \[ \] b/g) || []).length, 1);
  assert.strictEqual((text.match(/- \[ \] c/g) || []).length, 1);

  safeUpdateMarkdownChecklist(file, 'todo', ['- [ ] c']);
  text = fs.readFileSync(file, 'utf-8');
  assert.strictEqual((text.match(/- \[ \] c/g) || []).length, 1);

  console.log('safeUpdateMarkdownChecklist test passed');
})();
