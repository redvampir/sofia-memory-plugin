const fs = require('fs');
const path = require('path');
const github = require('./githubClient');

const indexPath = path.join(__dirname, 'memory', 'index.json');
let indexData = null;

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function githubWriteFileSafe(token, repo, relPath, data, message, attempts = 2) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await github.writeFile(token, repo, relPath, data, message);
      if (process.env.DEBUG) console.log(`[indexManager] pushed ${relPath}`);
      return;
    } catch (e) {
      console.error(`[indexManager] GitHub write attempt ${i} failed`, e.message);
      if (i === attempts) throw e;
    }
  }
}

async function loadIndex() {
  if (indexData) return indexData;
  if (!fs.existsSync(indexPath)) {
    console.warn('[indexManager] index.json not found, initializing');
    ensureDir(indexPath);
    indexData = [];
    await saveIndex();
    return indexData;
  }
  try {
    const content = fs.readFileSync(indexPath, 'utf-8');
    indexData = JSON.parse(content);
    if (!Array.isArray(indexData)) indexData = [];
  } catch (e) {
    console.warn('[indexManager] failed to parse index.json, resetting', e.message);
    indexData = [];
  }
  return indexData;
}

async function addOrUpdateEntry(entry) {
  if (!entry || !entry.path) return;
  if (!indexData) await loadIndex();
  const idx = indexData.findIndex(e => e.path === entry.path);
  const base = { lastModified: new Date().toISOString() };
  if (idx >= 0) {
    indexData[idx] = { ...indexData[idx], ...entry, ...base };
    if (process.env.DEBUG) console.log(`[indexManager] Updated entry ${entry.path}`);
  } else {
    indexData.push({ ...entry, ...base });
    if (process.env.DEBUG) console.log(`[indexManager] Added entry ${entry.path}`);
  }
}

async function removeEntry(p) {
  if (!indexData) await loadIndex();
  indexData = indexData.filter(e => e.path !== p);
}

async function saveIndex(repo, token) {
  if (!indexData) await loadIndex();
  ensureDir(indexPath);
  try {
    fs.writeFileSync(indexPath, JSON.stringify(indexData, null, 2), 'utf-8');
    if (process.env.DEBUG) console.log('[indexManager] index saved locally');
  } catch (e) {
    console.error('[indexManager] local write error', e.message);
  }

  if (repo && token) {
    try {
      const rel = path.relative(__dirname, indexPath);
      await githubWriteFileSafe(token, repo, rel, JSON.stringify(indexData, null, 2), 'update index.json');
    } catch (e) {
      console.error('[indexManager] failed to push index to GitHub', e.message);
    }
  }
}

module.exports = { loadIndex, addOrUpdateEntry, removeEntry, saveIndex };
