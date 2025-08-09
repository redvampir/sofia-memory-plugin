const fs = require('fs');
const path = require('path');

function slugify(text = '') {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

function importBook(bookId, filePath) {
  if (!bookId) throw new Error('bookId required');
  if (!fs.existsSync(filePath)) throw new Error(`file not found: ${filePath}`);

  const baseDir = path.join(__dirname, '..', '..', 'memory', 'books', bookId);
  fs.mkdirSync(baseDir, { recursive: true });

  const content = fs.readFileSync(filePath, 'utf-8');
  const headingRegex = /^#\s+(.+)$/gm;
  const matches = [];
  let m;
  while ((m = headingRegex.exec(content)) !== null) {
    matches.push({ title: m[1].trim(), index: m.index });
  }
  if (matches.length === 0) {
    matches.push({ title: 'chapter-1', index: 0 });
  }
  matches.push({ index: content.length });

  const index = [];
  for (let i = 0; i < matches.length - 1; i++) {
    const { title, index: start } = matches[i];
    const end = matches[i + 1].index;
    const chapterContent = content.slice(start, end).trim();
    const fileName = `${slugify(title) || `chapter-${i + 1}`}.md`;
    const outPath = path.join(baseDir, fileName);
    fs.writeFileSync(outPath, chapterContent, 'utf-8');
    index.push({ title, file: fileName, offset: start });
  }

  const indexPath = path.join(baseDir, 'index.json');
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
  return index;
}

module.exports = { importBook };
