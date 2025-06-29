const assert = require('assert');
const { updateMarkdownBlock } = require('../utils/markdown_utils');

(function run(){
  const src = [
    '# Title',
    '<!-- START: plan -->',
    'old text',
    '<!-- END: plan -->'
  ].join('\n');

  const replaced = updateMarkdownBlock(src, 'plan', 'new text');
  assert.ok(replaced.includes('new text'));
  assert.ok(!replaced.includes('old text'));

  const added = updateMarkdownBlock('# One', 'extra', 'block');
  assert.ok(added.includes('<!-- START: extra -->'));
  assert.ok(added.trim().endsWith('<!-- END: extra -->'));

  console.log('updateMarkdownBlock tests passed');
})();
