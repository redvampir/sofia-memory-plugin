const fs = require('fs');
const path = require('path');
const assert = require('assert');
const mdEditor = require('../core/markdownEditor');

const tmpDir = path.join(__dirname, 'tmp_dedupe');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

function read(p){return fs.readFileSync(p,'utf-8');}

(async function run(){
  const file = path.join(tmpDir,'dup.md');
  const content = [
    '# T',
    '',
    '## Tasks',
    '- [ ] one',
    '- [ ] ONE',
    '- [x] two',
    '- [ ] two',
    '',
    '<!-- section:start -->',
    '- item',
    '- item',
    '<!-- section:end -->'
  ].join('\n');
  fs.writeFileSync(file, content);

  mdEditor.deduplicateMarkdown({ filePath:file, heading:'Tasks' });
  let txt = read(file);
  assert.strictEqual((txt.match(/one/g) || []).length, 1);
  assert.strictEqual((txt.match(/two/g) || []).length, 1);

  mdEditor.deduplicateMarkdown({ filePath:file, startMarker:'<!-- section:start -->', endMarker:'<!-- section:end -->', mode:'keep-last' });
  txt = read(file);
  const segment = txt.split('<!-- section:start -->')[1].split('<!-- section:end -->')[0];
  assert.strictEqual((segment.match(/item/g) || []).length, 1);

  console.log('markdown deduplication tests passed');
})();
