const fs = require('fs');
const path = require('path');
const { index_to_array } = require('./index_utils');

function generateIndexForFolder(folder, entries) {
  const title = path.basename(folder).replace(/_/g, ' ');
  const lines = [`# ${title.charAt(0).toUpperCase() + title.slice(1)}`];
  entries.forEach(e => {
    const rel = path.relative(folder, e.path).replace(/\\/g, '/');
    lines.push(`- [${e.title}](${rel})`);
  });
  fs.writeFileSync(path.join(folder, 'index.md'), lines.join('\n') + '\n', 'utf-8');
}

function generateAll() {
  const indexPath = path.join(__dirname, '..', 'memory', 'index.json');
  const raw = fs.readFileSync(indexPath, 'utf-8');
  const data = index_to_array(JSON.parse(raw));
  const groups = {};
  data.forEach(e => {
    const dir = path.join(__dirname, '..', path.dirname(e.path));
    if (!groups[dir]) groups[dir] = [];
    groups[dir].push(e);
  });
  Object.keys(groups).forEach(dir => {
    generateIndexForFolder(dir, groups[dir]);
  });
}

if (require.main === module) generateAll();

module.exports = { generateAll };
