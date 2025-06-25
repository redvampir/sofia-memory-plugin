const fs = require('fs');
const path = require('path');

const rootIndexPath = path.join(__dirname, '..', 'memory', 'index.json');

function loadRoot() {
  if (!fs.existsSync(rootIndexPath)) return null;
  try {
    const raw = fs.readFileSync(rootIndexPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
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
  try {
    const raw = fs.readFileSync(p, 'utf-8');
    const data = JSON.parse(raw);
    return Array.isArray(data.files)
      ? data.files.map(f => ({ ...f, path: path.posix.join('memory', f.file) }))
      : [];
  } catch {
    return [];
  }
}

function listAllEntries() {
  const root = loadRoot();
  if (!root || !Array.isArray(root.branches)) return [];
  const entries = [];
  root.branches.forEach(b => {
    entries.push(...loadBranch(b.category));
  });
  return entries;
}

function findEntryByPath(p) {
  const rel = p.replace(/^memory\//, '');
  const root = loadRoot();
  if (!root || !Array.isArray(root.branches)) return null;
  for (const b of root.branches) {
    const dir = b.path.replace(/\/index\.json$/, '');
    if (rel.startsWith(dir)) {
      const entries = loadBranch(b.category);
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
