const assert = require('assert');
const { parseMarkdownSections } = require('../utils/markdown_utils');

(function run(){
  const content = [
    '# H1',
    'p1',
    '## H2',
    'p2',
    '<!-- START: tag -->',
    'inside',
    '<!-- END: tag -->'
  ].join('\n');

  const blocks = parseMarkdownSections(content);
  assert.strictEqual(blocks.length, 3);

  assert.deepStrictEqual(blocks[0], {
    type: 'header',
    title: 'H1',
    startIndex: 0,
    endIndex: 1,
    content: '# H1\np1'
  });

  assert.deepStrictEqual(blocks[1], {
    type: 'header',
    title: 'H2',
    startIndex: 2,
    endIndex: 3,
    content: '## H2\np2'
  });

  assert.deepStrictEqual(blocks[2], {
    type: 'anchor',
    tag: 'tag',
    startIndex: 4,
    endIndex: 6,
    content: '<!-- START: tag -->\ninside\n<!-- END: tag -->'
  });

  console.log('markdown sections tests passed');
})();
