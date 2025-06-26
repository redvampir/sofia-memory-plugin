const fs = require('fs');
const path = require('path');
const assert = require('assert');
const mdEditor = require('../logic/markdown_editor');

const tmpDir = path.join(__dirname, 'tmp_anchor_nodup');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

function read(p) { return fs.readFileSync(p, 'utf-8'); }

(async function run() {
  const file = path.join(tmpDir, 'dup.md');
  fs.writeFileSync(file, '# T\n\n## Tasks\n');

  const opts = {
    filePath: file,
    heading: 'Tasks',
    level: 2,
    content: '- item',
    skipIfExists: true
  };

  mdEditor.insertAtAnchor(opts);
  mdEditor.insertAtAnchor(opts);
  mdEditor.insertAtAnchor(opts);

  const txt = read(file);
  assert.strictEqual((txt.match(/- item/g) || []).length, 1);

  console.log('markdown anchor nodup tests passed');
})();
