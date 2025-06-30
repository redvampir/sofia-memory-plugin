const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { processMemoryFiles } = require('../tools/memory_helpers');
const { checkAndSplitIndex } = require('../tools/index_splitter');
const { MAX_INDEX_FILE_SIZE } = require('../utils/file_splitter');
const LRUCache = require('../utils/lru_cache');

const BASE_URL = 'https://api.github.com';

const reposCache = new LRUCache(100);
const contentsCache = new LRUCache(100);
const fileCache = new LRUCache(100);
const treeCache = new LRUCache(100);

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    'User-Agent': 'sofia-memory-plugin'
  };
}

async function listUserRepos(token) {
  const key = `repos:${token}`;
  const cached = reposCache.get(key);
  if (cached) return cached;
  const res = await axios.get(`${BASE_URL}/user/repos`, { headers: headers(token) });
  reposCache.set(key, res.data);
  return res.data;
}

async function getRepoContents(token, owner, repo, dirPath = '', page = 1, per_page = 100) {
  const tokenKey = token ? token.slice(0, 8) : 'none';
  const key = `contents:${tokenKey}:${owner}/${repo}:${dirPath}:${page}:${per_page}`;
  const cached = contentsCache.get(key);
  if (cached) return cached;
  const url = `${BASE_URL}/repos/${owner}/${repo}/contents/${encodeURIComponent(dirPath)}?per_page=${per_page}&page=${page}`;
  const res = await axios.get(url, { headers: headers(token) });
  contentsCache.set(key, res.data);
  return res.data;
}

function filterRepoFiles(files, fileType = '.js') {
  if (!Array.isArray(files)) return [];
  return files.filter(f => typeof f.name === 'string' && f.name.endsWith(fileType));
}

async function fetchFileContent(token, owner, repo, filePath) {
  const tokenKey = token ? token.slice(0, 8) : 'none';
  const key = `file:${tokenKey}:${owner}/${repo}:${filePath}`;
  const cached = fileCache.get(key);
  if (cached) return cached;
  const url = `${BASE_URL}/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}`;
  const res = await axios.get(url, { headers: headers(token) });
  if (res.data && res.data.content) {
    const content = Buffer.from(res.data.content, 'base64').toString('utf-8');
    fileCache.set(key, content);
    return content;
  }
  return '';
}

async function saveRepositoryData(owner, repo, data) {
  const dir = path.join(__dirname, '..', 'memory', 'github');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${owner}-${repo}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
  return file.replace(path.join(__dirname, '..') + '/', '');
}

async function createOrUpdateRepoIndex(token, owner, repo) {
  const tokenKey = token ? token.slice(0, 8) : 'none';
  const cacheKey = `tree:${tokenKey}:${owner}/${repo}`;
  let tree = treeCache.get(cacheKey);
  if (!tree) {
    const url = `${BASE_URL}/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`;
    const res = await axios.get(url, { headers: headers(token) });
    tree = Array.isArray(res.data && res.data.tree) ? res.data.tree : [];
    treeCache.set(cacheKey, tree);
  }
  const list = tree.map(item => ({
    name: path.basename(item.path),
    path: item.path,
    type: item.type,
  }));

  const dir = path.join(__dirname, '..', 'memory', 'github');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const indexPath = path.join(dir, `${owner}-${repo}-index.json`);
  const memoryIndexPath = path.join(dir, `${owner}-${repo}-memory-index.json`);

  let existing = [];
  let existingMemory = [];
  if (fs.existsSync(indexPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    } catch {}
  }
  if (fs.existsSync(memoryIndexPath)) {
    try {
      existingMemory = JSON.parse(fs.readFileSync(memoryIndexPath, 'utf-8'));
    } catch {}
  }

  const projectMap = new Map();
  const memoryMap = new Map();
  existing.forEach(e => projectMap.set(e.path, e));
  existingMemory.forEach(e => memoryMap.set(e.path, e));

  list.forEach(f => {
    const dest = processMemoryFiles(f.path);
    if (dest === 'memory') {
      if (!memoryMap.has(f.path)) {
        memoryMap.set(f.path, { ...f, checked: false });
      }
    } else {
      if (!projectMap.has(f.path)) {
        projectMap.set(f.path, { ...f, checked: false });
      }
    }
  });

  const projectIndex = Array.from(projectMap.values()).sort((a, b) => a.path.localeCompare(b.path));
  fs.writeFileSync(indexPath, JSON.stringify(projectIndex, null, 2), 'utf-8');
  await checkAndSplitIndex(indexPath, MAX_INDEX_FILE_SIZE);

  const memoryIndex = Array.from(memoryMap.values()).sort((a, b) => a.path.localeCompare(b.path));
  fs.writeFileSync(memoryIndexPath, JSON.stringify(memoryIndex, null, 2), 'utf-8');
  await checkAndSplitIndex(memoryIndexPath, MAX_INDEX_FILE_SIZE);

  return projectIndex;
}

function clearCache() {
  reposCache.clear();
  contentsCache.clear();
  fileCache.clear();
  treeCache.clear();
}

async function updateRepoIndexEntry(owner, repo, filePath, meta = {}) {
  const dir = path.join(__dirname, '..', 'memory', 'github');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const indexPath = path.join(dir, `${owner}-${repo}-index.json`);
  const memoryIndexPath = path.join(dir, `${owner}-${repo}-memory-index.json`);

  let project = [];
  let memory = [];
  if (fs.existsSync(indexPath)) {
    try { project = JSON.parse(fs.readFileSync(indexPath, 'utf-8')); } catch {}
  }
  if (fs.existsSync(memoryIndexPath)) {
    try { memory = JSON.parse(fs.readFileSync(memoryIndexPath, 'utf-8')); } catch {}
  }

  const dest = processMemoryFiles(filePath);
  const list = dest === 'memory' ? memory : project;
  const target = dest === 'memory' ? memoryIndexPath : indexPath;

  const idx = list.findIndex(e => e.path === filePath);
  const base = { path: filePath, type: 'blob' };
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...meta };
  } else {
    list.push({ ...base, ...meta });
  }
  list.sort((a, b) => a.path.localeCompare(b.path));
  fs.writeFileSync(target, JSON.stringify(list, null, 2), 'utf-8');
  return list.find(e => e.path === filePath);
}

async function markFileChecked(owner, repo, filePath) {
  await updateRepoIndexEntry(owner, repo, filePath, { checked: true });
}

async function mergeRepoFilesIntoIndex(owner, repo, files) {
  if (!Array.isArray(files) || !files.length) return [];

  const dir = path.join(__dirname, '..', 'memory', 'github');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const indexPath = path.join(dir, `${owner}-${repo}-index.json`);
  const memoryIndexPath = path.join(dir, `${owner}-${repo}-memory-index.json`);

  let existing = [];
  let existingMemory = [];
  if (fs.existsSync(indexPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    } catch {}
  }
  if (fs.existsSync(memoryIndexPath)) {
    try {
      existingMemory = JSON.parse(fs.readFileSync(memoryIndexPath, 'utf-8'));
    } catch {}
  }

  const projectMap = new Map();
  const memoryMap = new Map();
  existing.forEach(e => projectMap.set(e.path, e));
  existingMemory.forEach(e => memoryMap.set(e.path, e));

  files.forEach(f => {
    const dest = processMemoryFiles(f.path);
    if (dest === 'memory') {
      if (!memoryMap.has(f.path)) memoryMap.set(f.path, { ...f, checked: false });
    } else {
      if (!projectMap.has(f.path)) projectMap.set(f.path, { ...f, checked: false });
    }
  });

  const projectIndex = Array.from(projectMap.values()).sort((a, b) => a.path.localeCompare(b.path));
  fs.writeFileSync(indexPath, JSON.stringify(projectIndex, null, 2), 'utf-8');
  await checkAndSplitIndex(indexPath, MAX_INDEX_FILE_SIZE);

  const memoryIndex = Array.from(memoryMap.values()).sort((a, b) => a.path.localeCompare(b.path));
  fs.writeFileSync(memoryIndexPath, JSON.stringify(memoryIndex, null, 2), 'utf-8');
  await checkAndSplitIndex(memoryIndexPath, MAX_INDEX_FILE_SIZE);

  return projectIndex;
}

module.exports = {
  listUserRepos,
  getRepoContents,
  fetchFileContent,
  saveRepositoryData,
  createOrUpdateRepoIndex,
  markFileChecked,
  filterRepoFiles,
  mergeRepoFilesIntoIndex,
  updateRepoIndexEntry,
  clearCache
};
