const fs = require('fs');
const path = require('path');
const {
  validateRootIndex,
  validateBranchIndex,
} = require('./index_schemas');

const rootIndexPath = path.join(__dirname, '..', 'memory', 'index.json');

function loadRoot() {
  if (!fs.existsSync(rootIndexPath)) return null;
  const raw = fs.readFileSync(rootIndexPath, 'utf-8');
  const data = JSON.parse(raw);
  if (!validateRootIndex(data)) {
    console.error('[index_tree] root index schema invalid');
    throw new Error('invalid root index');
  }
  return data;
}

function getBranchInfo(category) {
  const root = loadRoot();
  if (!root || !Array.isArray(root.branches)) return null;
  return root.branches.find(b => b.category === category) || null;
}

function loadBranch(category) {
  const info = getBranchInfo(category);
  if (!info) return [];
  const p = path.join(__dirname, '..', 'memory', info.path);
  if (!fs.existsSync(p)) return [];
  const raw = fs.readFileSync(p, 'utf-8');
  const data = JSON.parse(raw);
  if (!validateBranchIndex(data)) {
    console.error(`[index_tree] branch index schema invalid: ${category}`);
    throw new Error('invalid branch index');
  }
  return Array.isArray(data.files)
    ? data.files.map(f => ({ ...f, path: path.posix.join('memory', f.file) }))
    : [];
}

function listAllEntries() {
  let root;
  try {
    root = loadRoot();
  } catch {
    return [];
  }
  if (!root || !Array.isArray(root.branches)) return [];
  const entries = [];
  root.branches.forEach(b => {
    try {
      entries.push(...loadBranch(b.category));
    } catch {}
  });
  return entries;
}

function findEntryByPath(p) {
  const rel = p.replace(/^memory\//, '');
  let root;
  try {
    root = loadRoot();
  } catch {
    return null;
  }
  if (!root || !Array.isArray(root.branches)) return null;
  for (const b of root.branches) {
    const dir = b.path.replace(/\/index\.json$/, '');
    if (rel.startsWith(dir)) {
      let entries;
      try {
        entries = loadBranch(b.category);
      } catch {
        return null;
      }
      return entries.find(e => e.path === path.posix.join('memory', rel)) || null;
    }
  }
  // fallback search all
  const all = listAllEntries();
  return all.find(e => e.path === path.posix.join('memory', rel)) || null;
}

function findEntryByTitle(title) {
  const all = listAllEntries();
  return all.find(e => e.title === title) || null;
}

module.exports = {
  loadRoot,
  loadBranch,
  listAllEntries,
  findEntryByPath,
  findEntryByTitle,
};
