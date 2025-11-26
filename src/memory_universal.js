/* Universal GitHub-backed memory helpers.
 * Save/read arbitrary files in the repository using GITHUB_TOKEN and optional GITHUB_BRANCH.
 */

const DEFAULT_REPO = process.env.GITHUB_REPO || 'redvampir/Memori_LLV';
const DEFAULT_BRANCH = process.env.GITHUB_BRANCH || 'main';

const logDebug = (...args) => {
  if (process.env.DEBUG_MODE === 'true') {
    console.info('[memory_universal]', ...args);
  }
};

const encodePath = (fileName) =>
  fileName
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');

const githubHeaders = () => ({
  Authorization: `token ${process.env.GITHUB_TOKEN}`,
  Accept: 'application/vnd.github.v3+json',
});

function missingTokenResponse() {
  return { status: 'unauthorized', error: 'GITHUB_TOKEN is not set' };
}

async function saveMemory(fileName, content) {
  if (!process.env.GITHUB_TOKEN) return missingTokenResponse();

  const baseUrl = `https://api.github.com/repos/${DEFAULT_REPO}/contents`;
  const path = encodePath(fileName);
  const body = {
    message: `update: ${fileName}`,
    content: Buffer.from(
      typeof content === 'string' ? content : JSON.stringify(content, null, 2)
    ).toString('base64'),
    branch: DEFAULT_BRANCH,
  };

  const headers = githubHeaders();

  // Check if file exists to get its sha
  const checkUrl = `${baseUrl}/${path}`;
  logDebug('GET', checkUrl);
  const check = await fetch(checkUrl, { headers });
  if (check.ok) {
    const existing = await check.json();
    body.sha = existing.sha;
  } else if (check.status !== 404) {
    const err = await check.text();
    logDebug('check failed', check.status, err);
    return { status: 'error', error: err || `check failed ${check.status}` };
  }

  const putUrl = `${baseUrl}/${path}`;
  logDebug('PUT', putUrl);
  const res = await fetch(putUrl, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });

  if (res.status === 401 || res.status === 403) {
    return missingTokenResponse();
  }

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { status: 'error', error: json.message || `save failed ${res.status}` };
  }

  return { status: 'ok', data: json };
}

async function readMemory(fileName) {
  if (!process.env.GITHUB_TOKEN) return missingTokenResponse();

  const baseUrl = `https://api.github.com/repos/${DEFAULT_REPO}/contents`;
  const url = `${baseUrl}/${encodePath(fileName)}?ref=${DEFAULT_BRANCH}`;
  const headers = {
    Authorization: `token ${process.env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github.v3.raw',
  };

  logDebug('GET', url);
  const res = await fetch(url, { headers });

  if (res.status === 401 || res.status === 403) {
    return missingTokenResponse();
  }
  if (res.status === 404) {
    return { status: 'not_found' };
  }
  if (!res.ok) {
    const err = await res.text();
    return { status: 'error', error: err || `read failed ${res.status}` };
  }

  const text = await res.text();
  try {
    return { status: 'ok', data: JSON.parse(text) };
  } catch {
    return { status: 'ok', data: text };
  }
}

module.exports = {
  saveMemory,
  readMemory,
};
