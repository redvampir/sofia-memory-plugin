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

const indexPath = path.join(__dirname, '..', 'memory', 'index.json');
let indexData = null;

function readLocalIndex() {
  if (!fs.existsSync(indexPath)) return [];
  try {
    const raw = fs.readFileSync(indexPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
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
  if (indexData) return indexData;
  if (!fs.existsSync(indexPath)) {
    console.warn('[indexManager] index.json not found, initializing');
    ensure_dir(indexPath);
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
    indexData.push({ ...entry, ...base });
    if (process.env.DEBUG) console.log(`[indexManager] Added entry ${entry.path}`);
  }
  await saveIndex();
}

async function removeEntry(p) {
  if (!indexData) await loadIndex();
  indexData = indexData.filter(e => e.path !== p);
}

async function saveIndex(token, repo, userId) {
  if (!indexData) await loadIndex();
  const finalToken = token || token_store.getToken(userId);
  const finalRepo = repo || memory_config.getRepoUrl(userId);

  let remoteData = [];
  if (finalRepo && finalToken) {
    try {
      const remoteRaw = await github.readFile(finalToken, finalRepo, 'memory/index.json');
      const remote = JSON.parse(remoteRaw);
      remoteData = remote;
    } catch (e) {
      if (e.response?.status !== 404) logError('indexManager GitHub read', e);
    }
  }

  const diskData = readLocalIndex();
  indexData = await mergeIndex(diskData, indexData || []);
  indexData = await mergeIndex(remoteData, indexData);
  ensure_dir(indexPath);
  try {
    fs.writeFileSync(indexPath, JSON.stringify(indexData, null, 2), 'utf-8');
    if (process.env.DEBUG) console.log('[indexManager] index saved locally');
  } catch (e) {
    logError('indexManager local write', e);
  }

  if (finalRepo && finalToken) {
    try {
      await github.writeFileSafe(
        finalToken,
        finalRepo,
        'memory/index.json',
        JSON.stringify(indexData, null, 2),
        'update index.json'
      );
      if (process.env.DEBUG) console.log('[indexManager] \u2714 index.json pushed');
    } catch (e) {
      logError('indexManager push index', e);
    }
  }
}

async function saveMemoryWithIndex(userId, repo, token, filename, content) {
  const storage = require('./storage');
  return storage.saveMemoryWithIndex(userId, repo, token, filename, content);
}

module.exports = {
  loadIndex,
  addOrUpdateEntry,
  removeEntry,
  saveIndex,
  mergeIndex,
  saveMemoryWithIndex,
  generateTitleFromPath,
  inferTypeFromPath
};
