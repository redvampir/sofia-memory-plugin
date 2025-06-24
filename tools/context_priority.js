const fs = require('fs');
const path = require('path');

const index_file = path.join(__dirname, '..', 'memory', 'index.json');

function load_index() {
  try {
    const raw = fs.readFileSync(index_file, 'utf-8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function save_index(data) {
  try {
    fs.writeFileSync(index_file, JSON.stringify(data, null, 2), 'utf-8');
  } catch {}
}

function touchIndexEntry(file_path) {
  if (!file_path) return;
  const index = load_index();
  const idx = index.findIndex(e => e.path === file_path);
  if (idx >= 0) {
    index[idx].last_accessed = new Date().toISOString();
    save_index(index);
  }
}

function updateContextPriority() {
  const index = load_index();
  const now = Date.now();
  let changed = false;

  index.forEach(entry => {
    if (!entry || !entry.path) return;
    const last = entry.last_accessed ? Date.parse(entry.last_accessed) : NaN;
    if (Number.isNaN(last)) return;
    const days = (now - last) / (1000 * 60 * 60 * 24);
    if (days > 30 && entry.context_priority !== 'low') {
      entry.context_priority = 'low';
      changed = true;
    } else if (days > 14 && entry.context_priority === 'high') {
      entry.context_priority = 'medium';
      changed = true;
    }
  });

  if (changed) save_index(index);
}

module.exports = { updateContextPriority, touchIndexEntry };
