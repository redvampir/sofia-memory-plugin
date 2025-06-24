const { read_memory, save_memory } = require('./logic/storage');
const { restore_context } = require('./context');
const memory_config = require('./tools/memory_config');
const token_store = require('./tools/token_store');
const { normalize_memory_path } = require('./tools/file_utils');

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

  console.log('[readMemory] Called with:', {
    repo: repo || null,
    token: masked_token,
    filename,
  });

  if (final_repo && final_token) {
    const url = `https://api.github.com/repos/${normalize_repo(final_repo)}/contents/${encodeURIComponent(normalized_file)}`;
    console.log('[readMemory] Sending GET request to:', url);
  }

  try {
    const content = await read_memory(null, repo, token, filename);
    console.log('[readMemory] Response: success');
    return content;
  } catch (e) {
    console.error('[readMemory] Error:', e.message);
    throw e;
  }
}

async function saveMemory(repo, token, filename, content) {
  const final_repo = repo || memory_config.getRepoUrl(null);
  const final_token = token || token_store.getToken(null);
  const masked_token = final_token ? `${final_token.slice(0, 4)}...` : 'null';
  const normalized_file = normalize_memory_path(filename);

  console.log('[saveMemory] Called with:', {
    repo: repo || null,
    token: masked_token,
    filename,
    hasContent: typeof content === 'string',
  });

  if (final_repo && final_token) {
    const url = `https://api.github.com/repos/${normalize_repo(final_repo)}/contents/${encodeURIComponent(normalized_file)}`;
    console.log('[saveMemory] Sending PUT request to:', url);
  }

  try {
    const result = await save_memory(null, repo, token, filename, content);
    console.log('[saveMemory] Response: success');
    return result;
  } catch (e) {
    console.error('[saveMemory] Error:', e.message);
    throw e;
  }
}

function setMemoryRepo(token, repo) {
  const user_id = null;
  const masked = token ? `${token.slice(0, 4)}...` : 'null';
  console.log('[setMemoryRepo] Called with:', { repo, token: masked });

  try {
    if (token !== undefined) token_store.setToken(user_id, token);
    if (repo !== undefined) memory_config.setRepoUrl(user_id, repo);
    console.log('[setMemoryRepo] Stored settings');
  } catch (e) {
    console.error('[setMemoryRepo] Error:', e.message);
    throw e;
  }
}

async function refreshContextFromMemoryFiles(repo, token) {
  const final_repo = repo || memory_config.getRepoUrl(null);
  const final_token = token || token_store.getToken(null);
  const masked_token = final_token ? `${final_token.slice(0, 4)}...` : 'null';

  console.log('[refreshContextFromMemoryFiles] Called with:', {
    repo: repo || null,
    token: masked_token,
  });

  if (final_repo && final_token) {
    const url = `https://api.github.com/repos/${normalize_repo(final_repo)}/contents/${encodeURIComponent('memory/index.json')}`;
    console.log('[refreshContextFromMemoryFiles] Sending GET request to:', url);
  }

  try {
    const result = await restore_context(false, { userId: null, repo, token });
    console.log('[refreshContextFromMemoryFiles] Response: success');
    return result;
  } catch (e) {
    console.error('[refreshContextFromMemoryFiles] Error:', e.message);
    throw e;
  }
}

module.exports = {
  readMemory,
  saveMemory,
  refreshContextFromMemoryFiles,
  setMemoryRepo,
};
