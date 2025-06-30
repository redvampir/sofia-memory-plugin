const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { processMemoryFiles } = require('../tools/memory_helpers');
const { checkAndSplitIndex } = require('../tools/index_splitter');
const { MAX_INDEX_FILE_SIZE } = require('../utils/file_splitter');

const BASE_URL = 'https://api.github.com';

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    'User-Agent': 'sofia-memory-plugin'
  };
}

async function listUserRepos(token) {
  const res = await axios.get(`${BASE_URL}/user/repos`, { headers: headers(token) });
  return res.data;
}

async function getRepoContents(token, owner, repo, dirPath = '', page = 1, per_page = 100) {
  const url = `${BASE_URL}/repos/${owner}/${repo}/contents/${encodeURIComponent(dirPath)}?per_page=${per_page}&page=${page}`;
  const res = await axios.get(url, { headers: headers(token) });
  return res.data;
}

function filterRepoFiles(files, fileType = '.js') {
  if (!Array.isArray(files)) return [];
  return files.filter(f => typeof f.name === 'string' && f.name.endsWith(fileType));
}

async function fetchFileContent(token, owner, repo, filePath) {
  const url = `${BASE_URL}/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}`;
  const res = await axios.get(url, { headers: headers(token) });
  if (res.data && res.data.content) {
    return Buffer.from(res.data.content, 'base64').toString('utf-8');
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
  const url = `${BASE_URL}/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`;
  const res = await axios.get(url, { headers: headers(token) });
  const list = Array.isArray(res.data && res.data.tree)
    ? res.data.tree.map(item => ({
        name: path.basename(item.path),
        path: item.path,
        type: item.type,
      }))
    : [];

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

async function markFileChecked(owner, repo, filePath) {
  const dir = path.join(__dirname, '..', 'memory', 'github');
  const indexPath = path.join(dir, `${owner}-${repo}-index.json`);
  if (!fs.existsSync(indexPath)) return;
  let data;
  try {
    data = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  } catch {
    return;
  }
  const idx = data.findIndex(f => f.path === filePath);
  if (idx >= 0) {
    data[idx].checked = true;
    fs.writeFileSync(indexPath, JSON.stringify(data, null, 2), 'utf-8');
  }
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
  mergeRepoFilesIntoIndex
};
