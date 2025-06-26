const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ume = require('../logic/universal_md_editor');

const tmpDir = path.join(__dirname, 'tmp_universal');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

(async function run(){
  const file = path.join(tmpDir, 'sample.md');
  fs.writeFileSync(file, '# Title\n');

  // add label
  ume.addLabel(file, '**Done**');
  let content = fs.readFileSync(file, 'utf-8');
  assert.ok(content.includes('**Done**'));

  // add footnote
  ume.addFootnote(file, 'a1', 'note text');
  content = fs.readFileSync(file, 'utf-8');
  assert.ok(content.includes('## Footnotes'));
  assert.ok(content.includes('[^a1]: note text'));

  // add section via addElement
  ume.addElement(file, 'section', { heading: 'New Section', contentLines: ['- item'] });
  content = fs.readFileSync(file, 'utf-8');
  assert.ok(content.includes('## New Section'));
  assert.ok(content.includes('- item'));

  console.log('universal md editor tests passed');
})();
