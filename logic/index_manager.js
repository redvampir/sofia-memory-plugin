const fs = require('fs');
const path = require('path');
const github = require('../tools/github_client');
const token_store = require('../tools/token_store');
const memory_config = require('../tools/memory_config');
const {
  ensure_dir,
  deepMerge,
  normalize_memory_path,
  generateTitleFromPath,
  inferTypeFromPath
} = require('../tools/file_utils');
const { logError } = require('../tools/error_handler');
const { sort_by_priority } = require('../tools/index_utils');
const index_tree = require('../tools/index_tree');
const { indexSettings, validateIndex } = require('./index_validator');

const indexPath = path.join(__dirname, '..', 'memory', 'index.json');
let indexData = null;
let validationReport = null;

function extractNumber(name) {
  const m = name.match(/(\d+)/);
  return m ? m[1].replace(/^0+/, '') : null;
}

async function validateFilePathAgainstIndex(filePath) {
  const normalized = normalize_memory_path(filePath);
  if (!indexData) await loadIndex();

  const base = path.posix.basename(normalized);
  const type = inferTypeFromPath(normalized);
  let folder = '';
  if (type === 'lesson') folder = 'memory/lessons';
  if (type === 'plan' || type === 'profile') folder = 'memory';

  let valid = true;
  let expected = normalized;
  let warning = null;

  if (folder && !normalized.startsWith(folder + '/')) {
    valid = false;
    expected = path.posix.join(folder, base);
    warning = `File ${base} expected in ${folder}`;
  }

  const num = extractNumber(base);
  if (num) {
    const existing = indexData.find(e => extractNumber(path.posix.basename(e.path)) === num);
    if (existing && existing.path !== normalized) {
      valid = false;
      expected = existing.path;
      warning = `Lesson ${num} already mapped to ${existing.path}`;
    }
  }

  return { valid, expectedPath: expected, warning };
}

async function getLessonPath(number) {
  const n = String(parseInt(number, 10)).padStart(2, '0');
  if (!indexData) await loadIndex();

  const found = indexData.find(
    e => inferTypeFromPath(e.path) === 'lesson' && extractNumber(path.posix.basename(e.path)) === n
  );
  if (found) return found.path;

  const newPath = `memory/lessons/lesson_${n}.md`;
  indexData.push({
    path: newPath,
    type: 'lesson',
    title: `Lesson ${n}`,
    lastModified: new Date().toISOString(),
  });
  await saveIndex();
  return newPath;
}

async function markDuplicateLessons(number, keepPath) {
  const n = String(parseInt(number, 10)).padStart(2, '0');
  if (!indexData) await loadIndex();
  let changed = false;
  indexData.forEach(entry => {
    if (inferTypeFromPath(entry.path) !== 'lesson') return;
    const num = extractNumber(path.posix.basename(entry.path));
    if (num === n && entry.path !== keepPath) {
      if (!entry.archived) {
        entry.archived = true;
        changed = true;
      }
    }
  });
  if (changed) await saveIndex();
}

function readLocalIndex() {
  if (!fs.existsSync(indexPath)) return [];
  try {
    const raw = fs.readFileSync(indexPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return sort_by_priority(index_to_array(parsed));
  } catch (e) {
    console.warn('[indexManager] failed to read local index', e.message);
    return [];
  }
}




async function mergeIndex(remoteData, localData) {
  const map = new Map();

  [...remoteData, ...localData].forEach(entry => {
    if (!entry?.path) return;
    const existing = map.get(entry.path) || {};
    map.set(entry.path, {
      ...existing,
      ...entry,
      lastModified: new Date().toISOString()
    });
  });

  return Array.from(map.values());
}
async function loadIndex() {
  try {
    let list = index_tree.listAllEntries();
    if (indexSettings.validate_on_load) {
      const res = validateIndex(list.map(e => ({ ...e, path: e.path })));
      list = res.entries;
      validationReport = res.report;
    }
    indexData = sort_by_priority(list.map(e => ({ ...e, path: e.path })));
    if (
      indexSettings.validate_on_load &&
      (indexSettings.auto_clean_invalid || indexSettings.auto_clean_missing)
    ) {
      await saveIndex();
    }
  } catch (e) {
    console.warn('[indexManager] failed to load index tree', e.message);
    indexData = [];
  }
  return indexData;
}

async function addOrUpdateEntry(entry) {
  if (!entry || !entry.path) return;
  const p = entry.path.replace(/\\/g, '/');
  if (!p.startsWith('memory/')) return;
  if (p.includes('/sofia-memory-plugin/')) return;
  if (p.includes('__tests__')) return;
  if (
    p.includes('context.md') ||
    p.includes('test.md') ||
    p.includes('test.txt')
  )
    return;
  if (!indexData) await loadIndex();
  const idx = indexData.findIndex(e => e.path === entry.path);
  const base = { lastModified: new Date().toISOString() };
  if (idx >= 0) {
    indexData[idx] = { ...indexData[idx], ...entry, ...base };
    if (process.env.DEBUG) console.log(`[indexManager] Updated entry ${entry.path}`);
  } else {
    indexData.push({
      context_priority: 'high',
      last_accessed: new Date().toISOString(),
      access_count: 0,
      edit_count: 0,
      pinned: false,
      ...entry,
      ...base,
    });
    if (process.env.DEBUG) console.log(`[indexManager] Added entry ${entry.path}`);
  }
  indexData = sort_by_priority(indexData);
  await saveIndex();
}

async function removeEntry(p) {
  if (!indexData) await loadIndex();
  indexData = sort_by_priority(indexData.filter(e => e.path !== p));
}

async function saveIndex(token, repo, userId) {
  if (!indexData) await loadIndex();
  const old_list = index_tree.listAllEntries();
  const old_paths = old_list.map(e => e.path);
  const manual_set = new Set(
    old_list.filter(e => e.source === 'manual').map(e => e.path)
  );

  let new_paths = indexData.map(e => e.path);
  manual_set.forEach(p => {
    if (!new_paths.includes(p)) new_paths.push(p);
  });

  const removed = old_paths.filter(p => !new_paths.includes(p));
  const added = new_paths.filter(p => !old_paths.includes(p));

  if (
    old_paths.length &&
    (removed.length > old_paths.length * 0.3 ||
      added.length + removed.length > old_paths.length * 0.5)
  ) {
    const logPath = path.join(__dirname, '..', 'memory', 'log.json');
    ensure_dir(logPath);
    let log = [];
    if (fs.existsSync(logPath)) {
      try {
        log = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
      } catch {}
    }
    log.push({
      time: new Date().toISOString(),
      removed,
      added,
    });
    fs.writeFileSync(logPath, JSON.stringify(log, null, 2), 'utf-8');

    indexData = sort_by_priority(old_list.map(e => ({ ...e }))); // revert changes
    return { warning: 'index update aborted due to large diff' };
  }

  const root = index_tree.loadRoot();
  if (!root || !Array.isArray(root.branches)) return;
  root.branches.forEach(b => {
    const dir = b.path.replace(/\/index\.json$/, '');
    const branchEntries = indexData.filter(e =>
      e.path.replace(/^memory\//, '').startsWith(dir)
    );
    const files = branchEntries.map(e => {
      const { path: filePath, ...meta } = e;
      return {
        ...meta,
        file: filePath.replace(/^memory\//, ''),
      };
    });
    const abs = path.join(__dirname, '..', 'memory', b.path);
    ensure_dir(abs);
    fs.writeFileSync(
      abs,
      JSON.stringify({ type: 'index-branch', category: b.category, files }, null, 2),
      'utf-8'
    );
  });
  return { saved: true };
}

async function saveMemoryWithIndex(userId, repo, token, filename, content) {
  const storage = require('./storage');
  return storage.saveMemoryWithIndex(userId, repo, token, filename, content);
}

async function addToIndex(file, meta = {}) {
  const normalized = normalize_memory_path(file);
  const abs = path.join(__dirname, '..', normalized);
  if (!fs.existsSync(abs)) {
    throw new Error(`File not found: ${normalized}`);
  }
  const entry = {
    path: normalized,
    title: meta.title || generateTitleFromPath(normalized),
    tags: meta.tags || [],
    summary: meta.summary,
    version: meta.version,
  };
  await addOrUpdateEntry(entry);
  await saveIndex();
}

function getValidationReport() {
  return validationReport
    ? JSON.parse(JSON.stringify(validationReport))
    : validationReport;
}

module.exports = {
  loadIndex,
  addOrUpdateEntry,
  removeEntry,
  saveIndex,
  mergeIndex,
  saveMemoryWithIndex,
  generateTitleFromPath,
  inferTypeFromPath,
  validateFilePathAgainstIndex,
  getLessonPath,
  markDuplicateLessons,
  addToIndex,
  getValidationReport,
};
