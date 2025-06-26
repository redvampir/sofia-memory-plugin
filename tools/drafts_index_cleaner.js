const fs = require('fs');
const path = require('path');

function cleanDraftsIndex(indexPath = path.join(__dirname, '..', 'memory', 'drafts', 'index.json')) {
  if (!fs.existsSync(indexPath)) return;
  let raw;
  try {
    raw = fs.readFileSync(indexPath, 'utf-8');
  } catch (e) {
    console.error('[drafts_index_cleaner] cannot read index', e.message);
    return;
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error('[drafts_index_cleaner] invalid JSON', e.message);
    return;
  }
  if (!Array.isArray(data.files)) return;

  const seen = new Set();
  const cleaned = [];
  data.files.forEach(entry => {
    if (!entry || !entry.file) return;
    const abs = path.join(__dirname, '..', 'memory', entry.file);
    if (!fs.existsSync(abs)) return; // skip missing files
    if (seen.has(entry.file)) return; // skip duplicates
    seen.add(entry.file);
    cleaned.push(entry);
  });

  data.files = cleaned;
  fs.writeFileSync(indexPath, JSON.stringify(data, null, 2), 'utf-8');
}

if (require.main === module) cleanDraftsIndex();

module.exports = { cleanDraftsIndex };
