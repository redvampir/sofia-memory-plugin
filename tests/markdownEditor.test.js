const fs = require('fs');
const path = require('path');
const assert = require('assert');
const mdEditor = require('../core/markdownEditor');

const tmpDir = path.join(__dirname, 'tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

async function run() {
  // Replace content between comment markers
  const blockFile = path.join(tmpDir, 'block.md');
  fs.writeFileSync(blockFile, 'Intro\n<!--start-->\nold text\n<!--end-->\nOutro');
  mdEditor.updateMarkdownFile({
    filePath: blockFile,
    startMarker: '<!--start-->',
    endMarker: '<!--end-->',
    newContent: 'new text'
  });
  const blockContent = fs.readFileSync(blockFile, 'utf-8');
  assert.ok(blockContent.includes('new text'));
  assert.ok(!blockContent.includes('old text'));
  assert.ok(blockContent.includes('<!--start-->'));
  assert.ok(blockContent.includes('<!--end-->'));

  // Replace checklist items under a heading
  const checklistFile = path.join(tmpDir, 'tasks.md');
  fs.writeFileSync(checklistFile, '# Title\n\n## Tasks\n- [ ] old\n## Done');
  mdEditor.updateMarkdownFile({
    filePath: checklistFile,
    startMarker: '## Tasks',
    endMarker: '## Done',
    newContent: '- [x] new item'
  });
  const checklistContent = fs.readFileSync(checklistFile, 'utf-8');
  assert.ok(checklistContent.includes('- [x] new item'));
  assert.ok(!checklistContent.includes('- [ ] old'));

  console.log('markdownEditor tests passed');
}

run();
