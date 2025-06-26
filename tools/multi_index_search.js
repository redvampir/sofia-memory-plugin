const fs = require('fs');
const path = require('path');

function loadIndex(file) {
  const abs = path.join(__dirname, '..', file);
  if (!fs.existsSync(abs)) return null;
  return JSON.parse(fs.readFileSync(abs, 'utf-8'));
}

function matchEntry(entry, query) {
  const q = String(query).toLowerCase();
  const fields = [entry.title];
  if (entry.metadata) {
    fields.push(entry.metadata.category, entry.metadata.sub_category);
  }
  return fields.some(v => v && String(v).toLowerCase().includes(q));
}

function searchInIndex(query, indexFile) {
  const data = loadIndex(indexFile);
  if (!data) return [];
  let results = [];

  if (Array.isArray(data.files)) {
    const matches = data.files.filter(e => matchEntry(e, query));
    results.push(...matches.slice(0, 10).map(e => ({ ...e, file: e.file })));
  }

  if (data.sub_indexes && typeof data.sub_indexes === 'object') {
    Object.values(data.sub_indexes).forEach(info => {
      const subPath = path.join(path.dirname(indexFile), info.index);
      results.push(...searchInIndex(query, subPath));
    });
  }

  if (!Array.isArray(data.files) && !data.sub_indexes) {
    Object.values(data).forEach(info => {
      if (info && info.index) {
        const subPath = info.index;
        results.push(...searchInIndex(query, subPath));
      }
    });
  }

  return results;
}

module.exports = { searchInIndex };
