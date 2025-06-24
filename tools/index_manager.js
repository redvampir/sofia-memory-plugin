const fs = require('fs');
const path = require('path');

function getContextFiles() {
  const indexFile = path.join(__dirname, '..', 'memory', 'index.json');
  try {
    const raw = fs.readFileSync(indexFile, 'utf-8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data
      .filter(e => e && e.context_priority === 'high' && e.path)
      .map(e => e.path);
  } catch {
    return [];
  }
}

module.exports = { getContextFiles };
