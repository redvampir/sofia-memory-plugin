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
  const normalized_file = normalize_memory_path(filename);

  logger.info('[readMemory] called', {
    repo: repo || null,
    token: masked_token,
    filename,
  });

  if (final_repo && final_token) {
    const url = `https://api.github.com/repos/${normalize_repo(final_repo)}/contents/${encodeURIComponent(normalized_file)}`;
    logger.debug('[readMemory] request url', url);
  }

  try {
    const content = await read_memory(null, repo, token, filename);
    logger.info('[readMemory] success');
    return content;
  } catch (e) {
    logger.error('[readMemory] error', e.message);
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

module.exports = {
  readMemory,
  saveMemory,
  refreshContextFromMemoryFiles,
  setMemoryRepo,
  read_memory_file,
};
