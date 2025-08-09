const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { importBook } = require('../../src/books/BookImporter');

const tmpDir = path.join(__dirname, 'tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

function run() {
  const bookId = 'sample-book';
  const bookFile = path.join(tmpDir, 'book.md');
  const content = '# Intro\nIntro text\n\n# Chapter Two\nSecond text';
  fs.writeFileSync(bookFile, content, 'utf-8');

  importBook(bookId, bookFile);

  const bookDir = path.join(__dirname, '..', '..', 'memory', 'books', bookId);
  const ch1 = path.join(bookDir, 'intro.md');
  const ch2 = path.join(bookDir, 'chapter-two.md');

  assert.ok(fs.existsSync(ch1), 'first chapter file exists');
  assert.ok(fs.existsSync(ch2), 'second chapter file exists');
  assert.strictEqual(fs.readFileSync(ch1, 'utf-8').trim(), '# Intro\nIntro text');
  assert.strictEqual(fs.readFileSync(ch2, 'utf-8').trim(), '# Chapter Two\nSecond text');

  const indexPath = path.join(bookDir, 'index.json');
  assert.ok(fs.existsSync(indexPath), 'index file exists');
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  assert.strictEqual(index.length, 2, 'two chapters indexed');
  assert.deepStrictEqual(index.map(c => c.title), ['Intro', 'Chapter Two']);
  assert.strictEqual(index[1].offset, content.indexOf('# Chapter Two'));

  fs.rmSync(bookDir, { recursive: true, force: true });
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('book importer tests passed');
}

module.exports = run;
if (require.main === module) run();
