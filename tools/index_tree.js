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
  const dir = path.join(
    __dirname,
    '..',
    'memory',
    path.dirname(info.path)
  );
  const base = path.basename(info.path, '.json');
  if (!fs.existsSync(dir)) return [];
  const files = fs
    .readdirSync(dir)
    .filter(
      f => f === `${base}.json` || (f.startsWith(`${base}.part`) && f.endsWith('.json'))
    )
    .sort((a, b) => {
      const getNum = name => {
        const m = name.match(/\.part(\d+)\.json$/);
        return m ? parseInt(m[1], 10) : 0;
      };
      return getNum(a) - getNum(b);
    });
  const entries = [];
  files.forEach(f => {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) return;
    const raw = fs.readFileSync(p, 'utf-8');
    const data = JSON.parse(raw);
    if (!validateBranchIndex(data)) {
      console.error(`[index_tree] branch index schema invalid: ${category}`);
      throw new Error('invalid branch index');
    }
    if (Array.isArray(data.files)) entries.push(...data.files);
  });
  return entries.map(e => ({ ...e, path: path.posix.join('memory', e.file) }));
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
