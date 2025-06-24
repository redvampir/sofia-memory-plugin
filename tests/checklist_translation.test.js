const fs = require('fs');
const path = require('path');
const assert = require('assert');
const editor = require('../logic/markdown_file_editor');

const tmpDir = path.join(__dirname, 'tmp_translate');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

(async function run(){
  const file = path.join(tmpDir,'list.md');
  const content = [
    '# Title',
    '- [ ] Translate this item',
    '- [ ] Перевести этот пункт',
    '- [x] Done in English',
    '- [ ] plan.md',
    '- [ ] Random item'
  ].join('\n');
  fs.writeFileSync(file, content);

  const map = {
    'Translate this item':'Перевести этот пункт',
    'Done in English':'Выполнено'
  };
  editor.translateChecklistItems(file, map);
  const out = fs.readFileSync(file,'utf-8');
  assert.ok(!out.includes('Translate this item'));
  assert.ok(out.includes('Перевести этот пункт'));
  assert.ok(out.includes('- [x] Выполнено'));
  assert.ok(out.includes('plan.md')); // skipped
  assert.ok(out.includes('## Untranslated'));
  assert.ok(out.includes('- [ ] Random item'));
  console.log('checklist translation test passed');
})();
