const fs = require('fs');
const path = require('path');
const assert = require('assert');
const editor = require('../markdownFileEditor');

const tmpDir = path.join(__dirname, 'tmp_struct');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

(async function run(){
  const file = path.join(tmpDir, 'list.md');
  fs.writeFileSync(file, '# Title\n\n## Tasks\n- [ ] old');

  // 1. add new unchecked item under existing section
  editor.insertTask(file, 'Tasks', 'new');
  let content = fs.readFileSync(file,'utf-8');
  assert.ok(content.includes('- [ ] new'));

  // 2. mark task as completed without duplication
  editor.updateChecklistItem(file, 'Tasks', 'old', { checked: true });
  content = fs.readFileSync(file,'utf-8');
  assert.ok(content.includes('- [x] old'));
  assert.strictEqual(content.match(/old/g).length, 1);

  // 3. remove a task by partial label match
  editor.removeTaskMatch(file, 'Tasks', 'new');
  content = fs.readFileSync(file,'utf-8');
  assert.ok(!content.includes('new'));

  // 4. add subtasks maintaining indentation
  editor.insertTask(file, 'Tasks', 'Main');
  editor.insertTask(file, 'Tasks', 'Sub1', { parent:'Main' });
  editor.insertTask(file, 'Tasks', 'Sub2', { parent:'Main', checked:true });
  content = fs.readFileSync(file,'utf-8');
  assert.ok(/Main\n  - \[ \] Sub1/.test(content));
  assert.ok(/Main\n(?:.*\n)*  - \[x\] Sub2/.test(content));

  // 5. insert into newly created section
  editor.insertTask(file, 'Extra', 'first');
  content = fs.readFileSync(file,'utf-8');
  assert.ok(content.includes('## Extra'));
  assert.ok(content.includes('- [ ] first'));

  console.log('structural checklist update tests passed');
})();
