const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { ensureMarkdownBlock } = require('../utils/markdown_utils');

const tmpDir = path.join(__dirname, 'tmp_autocreate');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

(function run(){
  const file = path.join(tmpDir, 'check.md');
  fs.writeFileSync(file, '# Title\n');
  ensureMarkdownBlock(file, 'tag', '- [ ] item', { created: '2025-06-29' });
  const text = fs.readFileSync(file, 'utf-8');
  assert.ok(text.includes('<!-- START: tag -->'));
  assert.ok(text.includes('<!-- END: tag -->'));
  assert.ok(text.includes('<!-- created: 2025-06-29 -->'));
  console.log('autocreate block test passed');
})();
