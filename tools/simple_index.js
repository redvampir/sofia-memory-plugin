const fs = require('fs').promises;
const path = require('path');

async function loadIndex(indexPath) {
  try {
    const raw = await fs.readFile(indexPath, 'utf-8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data.files)) data.files = [];
    return data;
  } catch {
    return { files: [] };
  }
}

function sortByPriority(arr) {
  return arr.slice().sort((a, b) => {
    const pa = a.priority ?? Infinity;
    const pb = b.priority ?? Infinity;
    if (pa === pb) return 0;
    return pa - pb;
  });
}

async function updateIndexFile(indexPath, newEntry) {
  if (!newEntry || !newEntry.file) return null;

  const data = await loadIndex(indexPath);
  let updated = false;
  data.files = data.files.map(e => {
    if (e.file === newEntry.file) {
      updated = true;
      return { ...e, ...newEntry };
    }
    return e;
  });
  if (!updated) data.files.push(newEntry);
  data.files = sortByPriority(data.files);
  await fs.mkdir(path.dirname(indexPath), { recursive: true });
  await fs.writeFile(indexPath, JSON.stringify(data, null, 2), 'utf-8');
  return data;
}

module.exports = { updateIndexFile };
