
const axios = require('axios');

function normalizeRepo(repo) {
  if (!repo) return repo;
  const match = repo.match(/github\.com[:\/](.+?)(?:\.git)?$/);
  return match ? match[1] : repo;
}

exports.validateToken = async function (token) {
  try {
    const res = await axios.get('https://api.github.com/user', {
      headers: { Authorization: `token ${token}` }
    });
    return { valid: true, user: res.data.login };
  } catch (e) {
    return { valid: false, error: e.message };
  }
};

exports.repoExists = async function (token, repo) {
  const normalized = normalizeRepo(repo);
  try {
    const res = await axios.get(`https://api.github.com/repos/${normalized}`, {
      headers: { Authorization: `token ${token}` }
    });
    return res.status === 200;
  } catch (e) {
    return false;
  }
};

exports.readFile = async function(token, repo, filePath) {
  const normalized = normalizeRepo(repo);
  const url = `https://api.github.com/repos/${normalized}/contents/${encodeURIComponent(filePath)}`;
  const res = await axios.get(url, { headers: { Authorization: `token ${token}` } });
  return Buffer.from(res.data.content, 'base64').toString('utf-8');
};

exports.writeFile = async function(token, repo, filePath, content, message) {
  const normalized = normalizeRepo(repo);
  const url = `https://api.github.com/repos/${normalized}/contents/${encodeURIComponent(filePath)}`;
  let sha = undefined;
  try {
    const res = await axios.get(url, { headers: { Authorization: `token ${token}` } });
    sha = res.data.sha;
  } catch(e) {
    // file may not exist, ignore
  }
  const body = {
    message: message || `update ${filePath}`,
    content: Buffer.from(content, 'utf-8').toString('base64'),
  };
  if (sha) body.sha = sha;
  await axios.put(url, body, { headers: { Authorization: `token ${token}` } });
};

