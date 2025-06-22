const fs = require('fs');
const path = require('path');
const assert = require('assert');
const mdEditor = require('../markdownEditor');

const tmpDir = path.join(__dirname, 'tmp_validate');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

function read(p){return fs.readFileSync(p,'utf-8');}

(async function run(){
  // 1. mismatched list levels
  const f1 = path.join(tmpDir,'bad_list.md');
  fs.writeFileSync(f1, '# T\n\n## Tasks\n- [ ] Main\n   - [ ] Sub');
  const r1 = mdEditor.markChecklistItem(f1, 'Tasks', 'Main', true);
  assert.strictEqual(r1, false);
  assert.ok(read(f1).includes('- [ ] Main')); // unchanged

  // 2. unclosed code block
  const f2 = path.join(tmpDir,'code.md');
  fs.writeFileSync(f2, '# T');
  const r2 = mdEditor.insertAtAnchor({filePath:f2, content:'```js\nconsole.log(1)', heading:'T', level:1});
  assert.strictEqual(r2, false);
  assert.strictEqual(read(f2).trim(), '# T');

  // 3. corrupted update rolled back
  const f3 = path.join(tmpDir,'corrupt.md');
  fs.writeFileSync(f3, '# T\ntext');
  const before = read(f3);
  const r3 = mdEditor.insertSection(f3, 'T', ['```']);
  assert.strictEqual(r3, false);
  assert.strictEqual(read(f3), before);

  // 4. valid update
  const f4 = path.join(tmpDir,'good.md');
  fs.writeFileSync(f4, '# T\n\n## S\n- [ ] a');
  const r4 = mdEditor.markChecklistItem(f4, 'S', 'a', true);
  assert.strictEqual(r4, true);
  assert.ok(read(f4).includes('- [x] a'));

  console.log('markdown validation tests passed');
})();
