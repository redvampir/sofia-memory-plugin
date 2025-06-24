const { read_memory, save_memory, get_file } = require('./logic/storage');
const { restore_context } = require('./context');
const memory_config = require('./tools/memory_config');
const token_store = require('./tools/token_store');
const { normalize_memory_path } = require('./tools/file_utils');
const logger = require('./utils/logger');

function normalize_repo(repo) {
  if (!repo) return repo;
  const m = repo.match(/github\.com[:\/](.+?)(?:\.git)?$/);
  return m ? m[1] : repo;
}

async function readMemory(repo, token, filename) {
  const final_repo = repo || memory_config.getRepoUrl(null);
  const final_token = token || token_store.getToken(null);
  const masked_token = final_token ? `${final_token.slice(0, 4)}...` : 'null';

  console.log('[readMemory] params', { repo: final_repo, token: masked_token, filename });

  if (final_repo && !final_token) {
    throw new Error('API access is not possible due to missing token');
  }

  let target = filename;

  if (!target) {
    try {
      const idx_raw = await read_memory(null, final_repo, final_token, 'memory/index.json');
      const idx = JSON.parse(idx_raw);
      target = idx.latest_lesson || idx.checklist_path || idx.path || null;
    } catch (e) {
      logger.error('[readMemory] index lookup failed', e.message);
    }
  } else if (!target.startsWith('memory/')) {
    try {
      const idx_raw = await read_memory(null, final_repo, final_token, 'memory/index.json');
      const idx = JSON.parse(idx_raw);
      if (Array.isArray(idx)) {
        const found = idx.find(e => e.title === target || e.path === target);
        if (found) target = found.path;
      } else if (idx[target]) {
        target = idx[target];
      }
    } catch (e) {
      logger.error('[readMemory] index search failed', e.message);
    }
  }

  if (!target) {
    throw new Error('File not found');
  }

  const normalized_file = normalize_memory_path(target);

  if (final_repo && final_token) {
    const url = `https://api.github.com/repos/${normalize_repo(final_repo)}/contents/${encodeURIComponent(normalized_file)}`;
    console.log('[readMemory] url', url);
  }

  try {
    const content = await read_memory(null, final_repo, final_token, normalized_file);
    console.log('[readMemory] success length', content.length);
    return content;
  } catch (e) {
    console.log('[readMemory] error', e.message);
    if (/not found/i.test(e.message)) throw new Error('File not found');
    throw e;
  }
}

async function saveMemory(repo, token, filename, content) {
  const final_repo = repo || memory_config.getRepoUrl(null);
  const final_token = token || token_store.getToken(null);
  const masked_token = final_token ? `${final_token.slice(0, 4)}...` : 'null';
  const normalized_file = normalize_memory_path(filename);

  logger.info('[saveMemory] called', {
    repo: repo || null,
    token: masked_token,
    filename,
    hasContent: typeof content === 'string',
  });

  if (final_repo && final_token) {
    const url = `https://api.github.com/repos/${normalize_repo(final_repo)}/contents/${encodeURIComponent(normalized_file)}`;
    logger.debug('[saveMemory] request url', url);
  }

  try {
    const result = await save_memory(null, repo, token, filename, content);
    logger.info('[saveMemory] success');
    return result;
  } catch (e) {
    logger.error('[saveMemory] error', e.message);
    throw e;
  }
}

function setMemoryRepo(token, repo) {
  const user_id = null;
  const masked = token ? `${token.slice(0, 4)}...` : 'null';
  logger.info('[setMemoryRepo] called', { repo, token: masked });

  try {
    if (token !== undefined) token_store.setToken(user_id, token);
    if (repo !== undefined) memory_config.setRepoUrl(user_id, repo);
    logger.info('[setMemoryRepo] stored settings');
  } catch (e) {
    logger.error('[setMemoryRepo] error', e.message);
    throw e;
  }
}

async function refreshContextFromMemoryFiles(repo, token) {
  const final_repo = repo || memory_config.getRepoUrl(null);
  const final_token = token || token_store.getToken(null);
  const masked_token = final_token ? `${final_token.slice(0, 4)}...` : 'null';

  logger.info('[refreshContextFromMemoryFiles] called', {
    repo: repo || null,
    token: masked_token,
  });

  if (final_repo && final_token) {
    const url = `https://api.github.com/repos/${normalize_repo(final_repo)}/contents/${encodeURIComponent('memory/index.json')}`;
    logger.debug('[refreshContextFromMemoryFiles] request url', url);
  }

  try {
    const result = await restore_context(false, { userId: null, repo, token });
    logger.info('[refreshContextFromMemoryFiles] success');
    return result;
  } catch (e) {
    logger.error('[refreshContextFromMemoryFiles] error', e.message);
    throw e;
  }
}

async function read_memory_file(filename, opts = {}) {
  const { repo = null, token = null, source = 'chat' } = opts;
  const normalized = normalize_memory_path(filename);
  logger.info('[read_memory_file] open', { path: normalized, source });
  try {
    const result = await get_file(null, repo, token, normalized);
    logger.info('[read_memory_file] success', { path: normalized, source });
    return result.content;
  } catch (e) {
    logger.error('[read_memory_file] error', {
      path: normalized,
      source,
      error: e.message,
    });
    throw e;
  }
}

async function readMarkdownFile(filepath, opts = {}) {
  const { repo = null, token = null } = opts;
  let target = filepath;
  const finalRepo = repo || memory_config.getRepoUrl(null);
  const finalToken = token || token_store.getToken(null);

  if (!target) {
    try {
      const idxRaw = await read_memory(null, finalRepo, finalToken, 'memory/index.json');
      const idx = JSON.parse(idxRaw);
      if (Array.isArray(idx)) {
        const first = idx.find(e => e.type === 'lesson') || idx[0];
        target = first ? first.path : null;
      } else {
        target = idx.latest_lesson || idx.path || null;
      }
    } catch (e) {
      logger.error('[readMarkdownFile] index lookup failed', e.message);
    }
  } else if (!target.startsWith('memory/')) {
    try {
      const idxRaw = await read_memory(null, finalRepo, finalToken, 'memory/index.json');
      const idx = JSON.parse(idxRaw);
      if (Array.isArray(idx)) {
        const found = idx.find(e => e.title === target || e.path === target);
        if (found) target = found.path;
      } else if (idx[target]) {
        target = idx[target];
      }
    } catch (e) {
      logger.error('[readMarkdownFile] index search failed', e.message);
    }
  }

  if (!target) throw new Error('File not found');

  const normalized = normalize_memory_path(target);
  if (!/\.md$/i.test(normalized)) {
    throw new Error('Markdown file expected');
  }

  try {
    const content = await read_memory(null, finalRepo, finalToken, normalized);
    return content;
  } catch (e) {
    logger.error('[readMarkdownFile] error', e.message);
    if (/not found/i.test(e.message)) throw new Error('File not found');
    throw e;
  }
}

module.exports = {
  readMemory,
  saveMemory,
  refreshContextFromMemoryFiles,
  setMemoryRepo,
  read_memory_file,
  readMarkdownFile,
};
