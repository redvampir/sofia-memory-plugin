const { read_memory, save_memory, get_file } = require('./logic/storage');
const { restore_context } = require('./context');
const { getContextFiles } = require('./tools/index_manager');
const {
  updateContextPriority,
  touchIndexEntry,
} = require('./tools/context_priority');
const memory_config = require('./tools/memory_config');
const token_store = require('./tools/token_store');
const { normalize_memory_path } = require('./tools/file_utils');
const logger = require('./utils/logger');
const { encodePath } = require('./tools/github_client');
const context_state = require('./tools/context_state');
const { index_to_array } = require('./tools/index_utils');

const MAX_TOKENS = 4096;

function count_tokens(text = '') {
  return String(text).split(/\s+/).filter(Boolean).length;
}

async function autoRefreshContext(repo, token) {
  if (context_state.get_needs_refresh()) {
    await refreshContextFromMemoryFiles(repo, token);
    console.log('🔄 Context refreshed from memory repo');
    context_state.set_needs_refresh(false);
    context_state.reset_tokens();
  }
}

function normalize_repo(repo) {
  if (!repo) return repo;
  const m = repo.match(/github\.com[:\/](.+?)(?:\.git)?$/);
  return m ? m[1] : repo;
}

async function readMemory(repo, token, filename) {
  const final_repo = repo || memory_config.getRepoUrl(null);
  const final_token = token || token_store.getToken(null);
  const masked_token = final_token ? `${final_token.slice(0, 4)}...` : 'null';

  await autoRefreshContext(final_repo, final_token);

  console.log('[readMemory] params', { repo: final_repo, token: masked_token, filename });

  if (final_repo && !final_token) {
    throw new Error('API access is not possible due to missing token');
  }

  let target = filename;

  if (!target) {
    try {
      const idx_raw = await read_memory(null, final_repo, final_token, 'memory/index.json');
      const idx = JSON.parse(idx_raw);
      if (Array.isArray(idx) || idx.lessons || idx.plans) {
        const list = index_to_array(idx);
        const first = list.find(e => e.type === 'lesson') || list[0];
        target = first ? first.path : null;
      } else {
        target = idx.latest_lesson || idx.path || null;
      }
    } catch (e) {
      logger.error('[readMemory] index lookup failed', e.message);
    }
  } else if (!target.startsWith('memory/')) {
    try {
      const idx_raw = await read_memory(null, final_repo, final_token, 'memory/index.json');
      const idx = JSON.parse(idx_raw);
      const list = index_to_array(idx);
      const found = list.find(e => e.title === target || e.path === target);
      if (found) target = found.path; else if (idx[target]) target = idx[target];
    } catch (e) {
      logger.error('[readMemory] index search failed', e.message);
    }
  }

  if (!target) {
    throw new Error('File not found');
  }

  const normalized_file = normalize_memory_path(target);

  if (final_repo && final_token) {
    const url = `https://api.github.com/repos/${normalize_repo(final_repo)}/contents/${encodePath(normalized_file)}`;
    console.log('[readMemory] url', url);
  }

  try {
    const content = await read_memory(null, final_repo, final_token, normalized_file);
    console.log('[readMemory] success length', content.length);
    touchIndexEntry(normalized_file);
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
    const url = `https://api.github.com/repos/${normalize_repo(final_repo)}/contents/${encodePath(normalized_file)}`;
    logger.debug('[saveMemory] request url', url);
  }

  if (count_tokens(content) > MAX_TOKENS) {
    throw new Error('Content too large for a single file');
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

async function saveReferenceAnswer(repo, token, key, content) {
  const file = `memory/answers/${key}.md`;
  return saveMemory(repo, token, file, content);
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

  updateContextPriority();

  const context_files = getContextFiles();
  logger.debug('[refreshContextFromMemoryFiles] high priority files', context_files);

  const loaded = {};
  const skipped = [];

  for (const p of context_files) {
    try {
      const content = await read_memory_file(p, { repo: final_repo, token: final_token, source: 'context-refresh' });
      loaded[p] = content;
      logger.debug('[refreshContextFromMemoryFiles] loaded', p);
    } catch (e) {
      skipped.push(p);
      logger.error('[refreshContextFromMemoryFiles] failed', { path: p, error: e.message });
    }
  }

  if (skipped.length) logger.info('[refreshContextFromMemoryFiles] skipped', skipped);

  const pick = regex => {
    const key = context_files.find(f => regex.test(f));
    return key ? loaded[key] || null : null;
  };

  logger.info('[refreshContextFromMemoryFiles] success', { loaded: Object.keys(loaded) });
  return {
    plan: pick(/plan/i),
    profile: pick(/profile/i),
    currentLesson: pick(/lesson/i),
  };
}

async function read_memory_file(filename, opts = {}) {
  const { repo = null, token = null, source = 'chat' } = opts;
  await autoRefreshContext(repo || memory_config.getRepoUrl(null), token || token_store.getToken(null));
  const normalized = normalize_memory_path(filename);
  logger.info('[read_memory_file] open', { path: normalized, source });
  try {
    const result = await get_file(null, repo, token, normalized);
    logger.info('[read_memory_file] success', { path: normalized, source });
    touchIndexEntry(normalized);
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

  await autoRefreshContext(finalRepo, finalToken);

  if (!target) {
    try {
      const idxRaw = await read_memory(null, finalRepo, finalToken, 'memory/index.json');
      const idx = JSON.parse(idxRaw);
      if (Array.isArray(idx) || idx.lessons || idx.plans) {
        const list = index_to_array(idx);
        const first = list.find(e => e.type === 'lesson') || list[0];
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
      const list = index_to_array(idx);
      const found = list.find(e => e.title === target || e.path === target);
      if (found) target = found.path; else if (idx[target]) target = idx[target];
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
    touchIndexEntry(normalized);
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
  saveReferenceAnswer,
  register_user_prompt: context_state.register_user_prompt,
};
