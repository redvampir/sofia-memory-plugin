const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { safe_markdown_edit } = require('../tools/markdown_hybrid_edit');

const tmpDir = path.join(__dirname, 'tmp_hybrid');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

(async function run(){
  const file = path.join(tmpDir, 'sample.md');
  fs.writeFileSync(file, '# Title\n\n## ToDo\n');

  await safe_markdown_edit(file, { action:'add_checklist_item', section:'ToDo', text:'- [ ] Check styles' }, { autoConfirm:true });
  let content = fs.readFileSync(file, 'utf-8');
  assert.ok(content.includes('Check styles'));

  await safe_markdown_edit(file, { action:'check_item', section:'ToDo', text:'Check styles' }, { autoConfirm:true });
  content = fs.readFileSync(file, 'utf-8');
  assert.ok(/- \[x\] Check styles/.test(content));

  await safe_markdown_edit(file, { action:'insert_subitem', section:'ToDo', parent:'Check styles', text:'Fix mobile' }, { autoConfirm:true });
  content = fs.readFileSync(file, 'utf-8');
  assert.ok(/Check styles\n  - \[ \] Fix mobile/.test(content));

  await safe_markdown_edit(file, { action:'remove_item', section:'ToDo', text:'Fix mobile' }, { autoConfirm:true });
  content = fs.readFileSync(file, 'utf-8');
  assert.ok(!content.includes('Fix mobile'));

  await safe_markdown_edit(file, { action:'rename_section', section:'ToDo', new:'Plan' }, { autoConfirm:true });
  content = fs.readFileSync(file, 'utf-8');
  assert.ok(content.includes('## Plan'));

  let failed = false;
  try {
    await safe_markdown_edit(file, { action:'add_checklist_item', section:'Missing', text:'- [ ] none' }, { autoConfirm:true });
  } catch (e) { failed = true; }
  assert.ok(failed);

  console.log('markdown hybrid edit tests passed');
})();
