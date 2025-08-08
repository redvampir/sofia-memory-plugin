const fs = require('fs/promises');
const path = require('path');

const index_file = path.join(__dirname, '..', 'memory', 'index.json');
const { index_to_array, array_to_index } = require('./index_utils');
const { archiveFile } = require('../logic/archive_manager');

async function load_index() {
  try {
    const raw = await fs.readFile(index_file, 'utf-8');
    const data = JSON.parse(raw);
    return index_to_array(data);
  } catch {
    return [];
  }
}

async function save_index(data) {
  try {
    await fs.writeFile(index_file, JSON.stringify(array_to_index(data), null, 2), 'utf-8');
  } catch {
    // ignore errors
  }
}

async function touchIndexEntry(file_path) {
  if (!file_path) return;
  const index = await load_index();
  const idx = index.findIndex(e => e.path === file_path);
  if (idx >= 0) {
    const entry = index[idx];
    entry.last_accessed = new Date().toISOString();
    entry.access_count = (entry.access_count || 0) + 1;
    await save_index(index);
  }
}

async function incrementEditCount(file_path) {
  if (!file_path) return;
  const index = await load_index();
  const idx = index.findIndex(e => e.path === file_path);
  if (idx >= 0) {
    const entry = index[idx];
    entry.edit_count = (entry.edit_count || 0) + 1;
    await save_index(index);
  }
}

async function updateContextPriority() {
  const index = await load_index();
  const now = Date.now();
  let changed = false;
  const keep = [];

  for (const entry of index) {
    if (!entry || !entry.path) continue;
    const last = entry.last_accessed ? Date.parse(entry.last_accessed) : NaN;
    const days = Number.isNaN(last)
      ? Infinity
      : (now - last) / (1000 * 60 * 60 * 24);

    entry.access_count = entry.access_count || 0;
    entry.edit_count = entry.edit_count || 0;
    entry.importance_score = entry.importance_score || 0;

    if (days !== Infinity) {
      const halfLife = 30; // days for importance to halve
      const decayFactor = Math.pow(0.5, days / halfLife);
      const newImp = entry.importance_score * decayFactor;
      if (Math.abs(newImp - entry.importance_score) > 1e-6) {
        entry.importance_score = newImp;
        changed = true;
      }
    }

    if (entry.pinned) {
      keep.push(entry);
      continue;
    }

    if (entry.access_count === 0 && days > 60) {
      changed = true;
      entry.archived = true;
      entry.context_priority = 'low';
      try {
        entry.archivePath = await archiveFile(entry.path);
      } catch {}
      keep.push(entry);
      continue;
    }

    const freqScore = Math.min(1, (entry.access_count + entry.edit_count) / 5);
    const recencyScore = Number.isFinite(days)
      ? Math.max(0, 1 - days / 30)
      : 0;
    const importanceScore = Math.min(1, entry.importance_score);
    const priorityScore =
      freqScore * 0.4 + recencyScore * 0.3 + importanceScore * 0.3;

    let newPriority = 'low';
    if (priorityScore >= 0.66) newPriority = 'high';
    else if (priorityScore >= 0.33) newPriority = 'medium';

    if (entry.context_priority !== newPriority) {
      entry.context_priority = newPriority;
      changed = true;
    }
    keep.push(entry);
  }

  if (changed) await save_index(keep);
}

module.exports = { updateContextPriority, touchIndexEntry, incrementEditCount };
