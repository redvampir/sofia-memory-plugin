const assert = require('assert');
const { resolveMarkdownPath } = require('../tools/markdown_finder');

(async function run(){
  const exact = await resolveMarkdownPath('memory/lessons/04_example.md');
  assert.strictEqual(exact, 'memory/lessons/04_example.md');

  const byTitle = await resolveMarkdownPath('Example Lesson');
  assert.strictEqual(byTitle, 'memory/lessons/04_example.md');

  const partial = await resolveMarkdownPath('example');
  if (typeof partial === 'object' && Array.isArray(partial.multiple)) {
    assert.ok(partial.multiple.includes('memory/lessons/04_example.md'));
  } else {
    assert.strictEqual(partial, 'memory/lessons/04_example.md');
  }

  console.log('markdown finder tests passed');
})();
