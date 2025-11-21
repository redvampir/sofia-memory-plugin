
// Клиент GitHub для чтения и записи файлов
const { Octokit } = require('@octokit/rest');
const axios = require('axios');
const { logError } = require('./error_handler');
const logger = require('../utils/logger');

// Заголовок User-Agent для GitHub API
const DEFAULT_HEADERS = { 'User-Agent': 'sofia-memory-plugin' };

function encodePath(p) {
  return p.split('/').map(encodeURIComponent).join('/');
}

function normalizeRepo(repo) {
  if (!repo) return repo;
  const match = repo.match(/github\.com[:\/](.+?)(?:\.git)?$/);
  return match ? match[1] : repo;
}

exports.validateToken = async function (token) {
  try {
    const res = await axios.get('https://api.github.com/user', {
      headers: { Authorization: `token ${token}`, ...DEFAULT_HEADERS }
    });
    return { valid: true, user: res.data.login };
  } catch (e) {
    logError('validateToken', e);
    return { valid: false, error: e.message };
  }
};

exports.repoExists = async function (token, repo) {
  const normalized = normalizeRepo(repo);
  const url = `https://api.github.com/repos/${normalized}`;
  const masked = token ? `${token.slice(0, 4)}...` : 'null';
  console.log('[repoExists] Repo:', normalized);
  console.log('[repoExists] Token:', masked);
  console.log('[repoExists] URL:', url);
  try {
    const res = await axios.get(url, {
      headers: { Authorization: `token ${token}`, ...DEFAULT_HEADERS }
    });
    console.log('[repoExists] status:', res.status);
    return { exists: res.status === 200, status: res.status };
  } catch (e) {
    const status = e.response ? e.response.status : undefined;
    const message =
      e.response && e.response.data && e.response.data.message
        ? e.response.data.message
        : undefined;
    if (e.response) {
      e.status = e.response.status;
      if (message) {
        e.githubMessage = message;
        e.message = message;
      }
    }
    console.log('[repoExists] status:', status);
    if (message) console.log('[repoExists] message:', message);
    logError('repoExists', e);
    return { exists: false, status, message };
  }
};

exports.repoExistsSafe = async function (token, repo, attempts = 4) {
  const normalized = normalizeRepo(repo);
  const networkCodes = new Set([
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'EAI_AGAIN',
    'ECONNREFUSED',
    'ECONNABORTED',
    'ENETUNREACH',
    'EHOSTUNREACH'
  ]);
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await axios.get(`https://api.github.com/repos/${normalized}`, {
        headers: { Authorization: `token ${token}`, ...DEFAULT_HEADERS }
      });
      return { exists: res.status === 200 };
    } catch (e) {
      const status = e.response ? e.response.status : undefined;
      logError(`repoExists attempt ${i}`, e);
      if (i === attempts) return { exists: false, status };
      if (e && (status >= 500 || (e.code && networkCodes.has(e.code)))) {
        const delay = Math.pow(2, i - 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        return { exists: false, status };
      }
    }
  }
};

exports.readFile = async function (token, repo, filePath) {
  const normalized = normalizeRepo(repo);
  const url = `https://api.github.com/repos/${normalized}/contents/${encodePath(filePath)}`;
  const masked = token ? `${token.slice(0, 4)}...` : 'null';
  console.log('[readFile] Repo:', normalized);
  console.log('[readFile] Token:', masked);
  console.log('[readFile] File:', filePath);
  console.log('[readFile] URL:', url);
  try {
    const [owner, repoName] = normalized.split('/');
    const octokit = new Octokit({
      auth: token,
      userAgent: 'sofia-memory-plugin'
    });
    const res = await octokit.repos.getContent({ owner, repo: repoName, path: filePath });
    console.log('[readFile] status:', res.status);
    return Buffer.from(res.data.content, 'base64').toString('utf-8');
  } catch (e) {
    if (e.response) {
      e.status = e.response.status;
      if (e.response.data && e.response.data.message) {
        e.githubMessage = e.response.data.message;
        e.message = e.response.data.message;
      }
    }
    logError('readFile', e);
    throw e;
  }
};

exports.writeFile = async function(token, repo, filePath, content, message, meta = {}) {
  const normalized = normalizeRepo(repo);
  const url = `https://api.github.com/repos/${normalized}/contents/${encodePath(filePath)}`;
  const attempt = Number.isFinite(meta.attempt) ? meta.attempt : 1;
  logger.info('[writeFile] Начало записи файла', {
    repo: normalized,
    filePath,
    attempt
  });
  let sha = undefined;
  try {
    const res = await axios.get(url, {
      headers: { Authorization: `token ${token}`, ...DEFAULT_HEADERS }
    });
    sha = res.data.sha;
  } catch(e) {
    // file may not exist, ignore
  }
  const body = {
    message: message || `update ${filePath}`,
    content: Buffer.from(content, 'utf-8').toString('base64'),
  };
  if (sha) body.sha = sha;
  try {
    const res = await axios.put(url, body, {
      headers: { Authorization: `token ${token}`, ...DEFAULT_HEADERS }
    });
    const commitSha = res.data && res.data.commit ? res.data.commit.sha : undefined;
    logger.info('[writeFile] Успешная запись файла', {
      repo: normalized,
      filePath,
      attempt,
      status: res.status,
      commitSha
    });
  } catch (e) {
    if (e.response) {
      e.status = e.response.status;
      if (e.response.data && e.response.data.message) {
        e.githubMessage = e.response.data.message;
        e.message = e.response.data.message;
      }
    }
    logError('writeFile', e);
    throw e;
  }
};

exports.writeFileSafe = async function(
  token,
  repo,
  filePath,
  content,
  message,
  attempts = 4
) {
  const networkCodes = new Set([
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'EAI_AGAIN',
    'ECONNREFUSED',
    'ECONNABORTED',
    'ENETUNREACH',
    'EHOSTUNREACH'
  ]);
  for (let i = 1; i <= attempts; i++) {
    logger.info('[writeFileSafe] Попытка записи файла', {
      repo,
      filePath,
      attempt: i
    });
    try {
      await exports.writeFile(token, repo, filePath, content, message, { attempt: i });
      return;
    } catch (e) {
      logError(`writeFile attempt ${i}`, e);
      if (i === attempts) throw e;
      if (e && (e.status >= 500 || (e.code && networkCodes.has(e.code)))) {
        const delay = Math.pow(2, i - 1) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
};

exports.encodePath = encodePath;

