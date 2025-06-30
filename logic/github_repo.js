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

module.exports = {
  listUserRepos,
  getRepoContents,
  fetchFileContent,
  saveRepositoryData
};
