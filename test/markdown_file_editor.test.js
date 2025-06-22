const fs = require('fs');
const path = require('path');
const assert = require('assert');
const editor = require('../markdownFileEditor');

const tmpDir = path.join(__dirname, 'tmp_file_editor');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

function read(p){return fs.readFileSync(p,'utf-8');}

async function run(){
  const file = path.join(tmpDir,'sample.md');
  fs.writeFileSync(file, '# Title\n\n## Tasks\n- [ ] Item\n- [x] Done\n\n## Extra\n- [ ] English');

  editor.addTask(file, 'Tasks', 'New Task');
  assert.ok(read(file).includes('New Task'));

  editor.removeTask(file, 'Tasks', 'Item');
  const cont1 = read(file);
  assert.ok(!cont1.includes('Item'));

  editor.addSection(file, 'Section', ['- [ ] Sub']);
  assert.ok(read(file).includes('Section'));

  editor.translateContent(file, { 'English': 'Русский' });
  assert.ok(read(file).includes('Русский'));

  fs.appendFileSync(file, '\n\n## Section\n- [ ] Sub');
  editor.cleanDuplicates(file);
  const cont2 = read(file);
  assert.strictEqual(cont2.match(/## Section/g).length, 1);

  console.log('markdown file editor tests passed');
}

run();
