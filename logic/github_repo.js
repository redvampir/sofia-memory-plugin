const axios = require('axios');
const fs = require('fs');
const path = require('path');

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
  let existing = [];
  if (fs.existsSync(indexPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    } catch {}
  }
  const map = new Map();
  existing.forEach(e => map.set(e.path, e));
  list.forEach(f => {
    const prev = map.get(f.path) || {};
    map.set(f.path, { ...f, checked: prev.checked || false });
  });
  const merged = Array.from(map.values()).sort((a, b) => a.path.localeCompare(b.path));
  fs.writeFileSync(indexPath, JSON.stringify(merged, null, 2), 'utf-8');
  return merged;
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

module.exports = {
  listUserRepos,
  getRepoContents,
  fetchFileContent,
  saveRepositoryData,
  createOrUpdateRepoIndex,
  markFileChecked
};
