const fs = require('fs');
const path = require('path');

const index_file = path.join(__dirname, '..', 'memory', 'index.json');
const { index_to_array, array_to_index } = require('./index_utils');

function load_index() {
  try {
    const raw = fs.readFileSync(index_file, 'utf-8');
    const data = JSON.parse(raw);
    return index_to_array(data);
  } catch {
    return [];
  }
}

function save_index(data) {
  try {
    fs.writeFileSync(index_file, JSON.stringify(array_to_index(data), null, 2), 'utf-8');
  } catch {}
}

function touchIndexEntry(file_path) {
  if (!file_path) return;
  const index = load_index();
  const idx = index.findIndex(e => e.path === file_path);
  if (idx >= 0) {
    const entry = index[idx];
    entry.last_accessed = new Date().toISOString();
    entry.access_count = (entry.access_count || 0) + 1;
    save_index(index);
  }
}

function incrementEditCount(file_path) {
  if (!file_path) return;
  const index = load_index();
  const idx = index.findIndex(e => e.path === file_path);
  if (idx >= 0) {
    const entry = index[idx];
    entry.edit_count = (entry.edit_count || 0) + 1;
    save_index(index);
  }
}

function updateContextPriority() {
  const index = load_index();
  const now = Date.now();
  let changed = false;
  const keep = [];

  index.forEach(entry => {
    if (!entry || !entry.path) return;
    if (entry.pinned) {
      keep.push(entry);
      return;
    }

    const last = entry.last_accessed ? Date.parse(entry.last_accessed) : NaN;
    const days = Number.isNaN(last) ? Infinity : (now - last) / (1000 * 60 * 60 * 24);

    entry.access_count = entry.access_count || 0;
    entry.edit_count = entry.edit_count || 0;

    if (entry.access_count === 0 && days > 60) {
      changed = true;
      return; // drop from context
    }

    if (entry.access_count >= 5 || entry.edit_count >= 3) {
      keep.push(entry);
      return;
    }

    if (days > 30 && entry.access_count < 3) {
      if (entry.context_priority === 'high') {
        entry.context_priority = 'medium';
        changed = true;
      } else if (entry.context_priority === 'medium') {
        entry.context_priority = 'low';
        changed = true;
      }
    }
    keep.push(entry);
  });

  if (changed) save_index(keep);
}

module.exports = { updateContextPriority, touchIndexEntry, incrementEditCount };
