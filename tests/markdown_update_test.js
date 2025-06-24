const fs = require('fs');
const path = require('path');
const assert = require('assert');
const mdEditor = require('../logic/markdown_editor');
const validator = require('../logic/markdown_validator');

const tmpDir = path.join(__dirname, 'tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

async function run() {
  // Empty file handling
  const emptyPath = path.join(tmpDir, 'empty.md');
  fs.writeFileSync(emptyPath, '');
  validator.validateMarkdownSyntax(fs.readFileSync(emptyPath, 'utf-8'), emptyPath);

  // Already completed task
  const checklist = path.join(tmpDir, 'checklist.md');
  fs.writeFileSync(checklist, '# Test\n## Tasks\n- [x] Sample');
  const updated = mdEditor.markChecklistItem(checklist, 'Tasks', 'Sample');
  assert.strictEqual(updated, false);

  // Adding a new task
  const sectionFile = path.join(tmpDir, 'section.md');
  fs.writeFileSync(sectionFile, '# Plan\n\n## 🟡 In Progress\n');
  mdEditor.insertSection(sectionFile, '🟡 In Progress', ['- [ ] New Task']);
  const content = fs.readFileSync(sectionFile, 'utf-8');
  assert.ok(content.includes('- [ ] New Task'));

  console.log('markdown update tests passed');
}

run();
