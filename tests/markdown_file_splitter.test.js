const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { splitMarkdownFile, MAX_MD_FILE_SIZE } = require('../utils/file_splitter');
const { parseMarkdownStructure } = require('../logic/markdown_merge_engine.ts');

const tmpDir = path.join(__dirname, 'tmp_md_file_split');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

function makeSection(i) {
  const num = String(i).padStart(4, '0');
  return `# Heading ${num}\n\nParagraph content ${num}\n\n`;
}

function countNodes(nodes, type) {
  let count = 0;
  for (const n of nodes) {
    if (n.type === type) count++;
    if (n.children) count += countNodes(n.children, type);
  }
  return count;
}

function run() {
  const bigPath = path.join(tmpDir, 'big.md');
  const chunk = makeSection(1);
  const chunkSize = Buffer.byteLength(chunk);
  const repeat = Math.ceil((MAX_MD_FILE_SIZE + 1024) / chunkSize);
  const content = Array.from({ length: repeat }, (_, i) => makeSection(i + 1)).join('');
  fs.writeFileSync(bigPath, content, 'utf-8');

  const originalTree = parseMarkdownStructure(content);
  const parts = splitMarkdownFile(bigPath);

  assert.ok(Array.isArray(parts), 'array returned');
  assert.ok(parts.length > 1, 'file should be split');

  parts.forEach(p => {
    assert.ok(p.endsWith('.md'), 'part has md extension');
    assert.ok(fs.existsSync(p), `part ${p} exists`);
    const sz = fs.statSync(p).size;
    assert.ok(sz <= MAX_MD_FILE_SIZE, 'part within size limit');
    const partTree = parseMarkdownStructure(fs.readFileSync(p, 'utf-8'));
    assert.ok(Array.isArray(partTree), 'parsed markdown');
  });

  const combined = parts.map(p => fs.readFileSync(p, 'utf-8')).join('');
  const combinedTree = parseMarkdownStructure(combined);
  assert.strictEqual(
    countNodes(combinedTree, 'heading'),
    countNodes(originalTree, 'heading'),
    'heading count preserved'
  );
  assert.strictEqual(
    countNodes(combinedTree, 'paragraph'),
    countNodes(originalTree, 'paragraph'),
    'paragraph count preserved'
  );

  const smallPath = path.join(tmpDir, 'small.md');
  fs.writeFileSync(smallPath, '# Small\n\nJust text', 'utf-8');
  const smallParts = splitMarkdownFile(smallPath);
  assert.strictEqual(smallParts.length, 1, 'small file not split');
  assert.strictEqual(smallParts[0], smallPath);

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('markdown file splitter tests passed');
}

module.exports = run;
if (require.main === module) run();
