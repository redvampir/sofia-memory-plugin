const assert = require('assert');
const { parseMarkdownStructure, mergeMarkdownTrees, serializeMarkdownTree } = require('../markdownMergeEngine.ts');

(function run(){
  // 1. translated text replacement
  const base = parseMarkdownStructure('# T\n- [ ] Translate this item');
  const update = parseMarkdownStructure('# T\n- [ ] Перевести этот пункт');
  const merged = mergeMarkdownTrees(base, update);
  const out = serializeMarkdownTree(merged);
  assert.ok(!out.includes('Translate this item'));
  assert.ok(out.includes('Перевести этот пункт'));

  // 2. deduplication
  const b2 = parseMarkdownStructure('# T\n- [ ] one');
  const u2 = parseMarkdownStructure('# T\n- [ ] one\n- [ ] one');
  const m2 = mergeMarkdownTrees(b2, u2, { dedupe: true });
  const out2 = serializeMarkdownTree(m2);
  assert.strictEqual((out2.match(/one/g) || []).length, 1);

  // 3. replaced text
  const b3 = parseMarkdownStructure('# T\n- [ ] old');
  const u3 = parseMarkdownStructure('# T\n- [ ] new');
  const m3 = mergeMarkdownTrees(b3, u3);
  const out3 = serializeMarkdownTree(m3);
  assert.ok(out3.includes('new') && !out3.includes('old'));

  // 4. full replace mode
  const b4 = parseMarkdownStructure('# T\n\n## S\n- [ ] a\n- [ ] b');
  const u4 = parseMarkdownStructure('# T\n\n## S\n- [ ] c');
  const m4 = mergeMarkdownTrees(b4, u4, { replace: true });
  const out4 = serializeMarkdownTree(m4);
  assert.ok(out4.includes('- [ ] c'));
  assert.ok(!out4.includes('- [ ] a'));
  assert.ok(!out4.includes('- [ ] b'));

  console.log('markdown merge logic tests passed');
})();
