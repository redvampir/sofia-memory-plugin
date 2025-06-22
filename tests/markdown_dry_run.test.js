const fs = require('fs');
const path = require('path');
const assert = require('assert');
const editor = require('../core/markdownFileEditor');

const tmpDir = path.join(__dirname, 'tmp_dry_run');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

function read(p){return fs.readFileSync(p,'utf-8');}

async function run(){
  const file = path.join(tmpDir,'sample.md');
  fs.writeFileSync(file, '# Title\n\n## A\n- [ ] one');

  const result = editor.addTask(file, 'A', 'two', false, { dryRun: true });
  const content = read(file);
  assert.ok(!content.includes('two'));
  assert.ok(result.content.includes('two'));

  let threw = false;
  try {
    editor.addSectionPath(file, ['Missing'], ['text'], { requireExisting: true });
  } catch (e) {
    threw = true;
  }
  assert.ok(threw);

  console.log('markdown dry-run tests passed');
}

run();
