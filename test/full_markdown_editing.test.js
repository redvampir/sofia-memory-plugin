const fs = require('fs');
const path = require('path');
const assert = require('assert');
const editor = require('../markdownFileEditor');

const tmpDir = path.join(__dirname, 'tmp_full');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);
const backupsDir = path.join(__dirname, '..', 'memory', '_backups');
if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });

function read(p){return fs.readFileSync(p,'utf-8');}

async function run(){
  const file = path.join(tmpDir,'plan_checklist.md');
  fs.writeFileSync(file, '# Plan Checklist\n\n## Tasks\n- [ ] Old');
  fs.readdirSync(backupsDir)
    .filter(f => f.startsWith('plan_checklist.md.bak'))
    .forEach(f => fs.unlinkSync(path.join(backupsDir, f)));

  // 1. add new item
  editor.addTask(file, 'Tasks', 'New');
  assert.ok(read(file).includes('New'));

  // 2. modify and mark
  editor.toggleTaskStatus(file, 'Tasks', 'Old', true);
  assert.ok(read(file).includes('- [x] Old'));

  // 3. insert under heading
  editor.addSectionPath(file, ['Tasks','Sub'], ['- [ ] Subtask']);
  assert.ok(read(file).includes('Subtask'));

  // replace text
  editor.updateTaskText(file, 'Tasks', 'New', 'Updated');
  const content1 = read(file);
  assert.ok(content1.includes('Updated'));
  assert.ok(!content1.includes('New'));

  // 4. translate text
  editor.addTask(file,'Tasks','code.js');
  editor.translateContent(file, { 'Updated':'Обновлено','Old':'Старый','Subtask':'Подзадача','code.js':'код.js' });
  const cont2 = read(file);
  assert.ok(cont2.includes('Обновлено'));
  assert.ok(cont2.includes('Подзадача'));
  // 5. skip code/file names
  assert.ok(cont2.includes('code.js'));
  assert.ok(!cont2.includes('код.js'));

  // 6. do not overwrite other content
  const extra = 'random line';
  fs.appendFileSync(file, '\n'+extra);
  const before = read(file);
  editor.addTask(file, 'Other', 'Extra');
  const after = read(file);
  assert.ok(after.includes(extra));

  // 7. backup created
  const backups = fs
    .readdirSync(backupsDir)
    .filter(f => f.startsWith('plan_checklist.md.bak'));
  assert.ok(backups.length > 0);

  // file existence + fallback
  const missing = path.join(tmpDir,'new_notes.md');
  editor.addTask(missing, 'Note', 'Something');
  assert.ok(fs.existsSync(missing));
  assert.ok(read(missing).includes('Something'));

  // unsorted when item missing
  editor.toggleTaskStatus(file, 'Missing', 'Inserted', true);
  const cont3 = read(file);
  assert.ok(cont3.includes('Unsorted'));
  assert.ok(cont3.includes('Inserted'));

  console.log('full markdown editing tests passed');
}

run();
