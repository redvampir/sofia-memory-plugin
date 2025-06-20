const fs = require('fs');
const path = require('path');
const github = require('./githubClient');
const tokenStore = require('./tokenStore');
const memoryConfig = require('./memoryConfig');

const indexPath = path.join(__dirname, 'memory', 'index.json');
let indexData = null;

function isObject(val) {
  return val && typeof val === 'object' && !Array.isArray(val);
}

function deepMerge(target, source, matchKey) {
  if (Array.isArray(target) && Array.isArray(source)) {
    const result = [...target];
    source.forEach(item => {
      if (matchKey && isObject(item)) {
        const idx = result.findIndex(e => isObject(e) && e[matchKey] === item[matchKey]);
        if (idx >= 0) {
          result[idx] = deepMerge(result[idx], item, matchKey);
        } else {
          result.push(item);
        }
      } else if (!result.includes(item)) {
        result.push(item);
      }
    });
    return result;
  } else if (isObject(target) && isObject(source)) {
    const out = { ...target };
    Object.keys(source).forEach(k => {
      if (k in target) {
        out[k] = deepMerge(target[k], source[k], matchKey);
      } else {
        out[k] = source[k];
      }
    });
    return out;
  }
  return source;
}

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function normalizeMemoryPath(p) {
  if (!p) return 'memory/';
  let rel = p.replace(/\\+/g, '/');
  rel = path.posix.normalize(rel).replace(/^(\.\/)+/, '').replace(/^\/+/, '');
  while (rel.startsWith('memory/')) {
    rel = rel.slice('memory/'.length);
  }
  return path.posix.join('memory', rel);
}

function generateTitleFromPath(p) {
  return p
    .split('/')
    .pop()
    .replace(/\..+$/, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());
}

function inferTypeFromPath(p) {
  if (p.includes('plan')) return 'plan';
  if (p.includes('profile')) return 'profile';
  if (p.includes('lesson')) return 'lesson';
  if (p.includes('note')) return 'note';
  return 'file';
}

async function githubWriteFileSafe(token, repo, relPath, data, message, attempts = 2) {
  for (let i = 1; i <= attempts; i++) {
    try {
      ensureDir(path.join(__dirname, path.dirname(relPath)));
      await github.writeFile(token, repo, relPath, data, message);
      if (process.env.DEBUG) console.log(`[indexManager] pushed ${relPath}`);
      return;
    } catch (e) {
      console.error(`[indexManager] GitHub write attempt ${i} failed`, e.message);
      if (i === attempts) throw e;
    }
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

async function saveIndex(repo, token, userId) {
  if (!indexData) await loadIndex();
  const finalRepo = repo || memoryConfig.getRepoUrl(userId);
  const finalToken = token || tokenStore.getToken(userId);

  let remoteData = [];
  if (finalRepo && finalToken) {
    try {
      const rel = path.relative(__dirname, indexPath);
      const remote = await github.readFile(finalToken, finalRepo, rel);
      remoteData = JSON.parse(remote);
    } catch (e) {
      if (e.response?.status !== 404) console.error('[indexManager] GitHub read error', e.message);
    }
  }

  indexData = await mergeIndex(remoteData || [], indexData || []);
  ensureDir(indexPath);
  try {
    fs.writeFileSync(indexPath, JSON.stringify(indexData, null, 2), 'utf-8');
    if (process.env.DEBUG) console.log('[indexManager] index saved locally');
  } catch (e) {
    console.error('[indexManager] local write error', e.message);
  }

  if (finalRepo && finalToken) {
    try {
      const rel = path.relative(__dirname, indexPath);
      await githubWriteFileSafe(finalToken, finalRepo, rel, JSON.stringify(indexData, null, 2), 'update index.json');
      if (process.env.DEBUG) console.log('[indexManager] \u2714 index.json pushed');
    } catch (e) {
      console.error('[indexManager] failed to push index to GitHub', e.message);
    }
  }
}

async function saveMemoryWithIndex(userId, repo, token, filename, content) {
  const finalRepo = repo || memoryConfig.getRepoUrl(userId);
  const finalToken = token || tokenStore.getToken(userId);
  if (!finalRepo || !finalToken) {
    throw new Error('Missing repo or token');
  }
  const normalized = normalizeMemoryPath(filename);
  await githubWriteFileSafe(finalToken, finalRepo, normalized, content, `update ${filename}`);
  await addOrUpdateEntry({
    path: normalized,
    title: generateTitleFromPath(normalized),
    type: inferTypeFromPath(normalized),
    lastModified: new Date().toISOString()
  });
  await saveIndex(finalRepo, finalToken, userId);
  console.log(`[Memory] Saved and indexed: ${normalized}`);
  return normalized;
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
