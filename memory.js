const { read_memory, save_memory, get_file } = require('./logic/storage');
const { restore_context } = require('./context');
const { getContextFiles, getContextFilesForKeywords } = require('./tools/index_manager');
const {
  updateContextPriority,
  touchIndexEntry,
} = require('./tools/context_priority');
const memory_config = require('./tools/memory_config');
const token_store = require('./tools/token_store');
const { normalize_memory_path } = require('./tools/file_utils');
const path = require('path');
const logger = require('./utils/logger');
const { encodePath } = require('./tools/github_client');
const context_state = require('./tools/context_state');
const { index_to_array } = require('./tools/index_utils');
const { split_memory_file } = require('./tools/memory_splitter');
const memory_settings = require('./tools/memory_settings');

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
    let content = await read_memory_file(normalized_file, {
      repo: final_repo,
      token: final_token,
      source: 'readMemory',
    });
    return content;
  } catch (e) {
    if (/not found/i.test(e.message) && /\.md$/i.test(normalized_file)) {
      const alt = normalized_file.replace(/\.md$/i, '/index.md');
      try {
        return await read_memory_file(alt, {
          repo: final_repo,
          token: final_token,
          source: 'readMemory',
        });
      } catch (e2) {
        if (/not found/i.test(e2.message)) throw new Error('File not found');
        throw e2;
      }
    }
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

  const tokens = count_tokens(content);
  if (tokens > memory_settings.token_soft_limit) {
    console.warn('[saveMemory] token limit reached', tokens);
    if (memory_settings.strict_guard) {
      return {
        warning:
          'This file has reached the safe size limit. Please restructure into subfiles before continuing.',
      };
    }
  }

  if (tokens > memory_settings.max_tokens_per_file) {
    const parts = await split_memory_file(filename, memory_settings.max_tokens_per_file);
    logger.info('[saveMemory] split large file', { parts });
    return { split: true, parts };
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

async function refreshContextFromMemoryFiles(repo, token, keywords = []) {
  const final_repo = repo || memory_config.getRepoUrl(null);
  const final_token = token || token_store.getToken(null);
  const masked_token = final_token ? `${final_token.slice(0, 4)}...` : 'null';

  logger.info('[refreshContextFromMemoryFiles] called', {
    repo: repo || null,
    token: masked_token,
  });

  updateContextPriority();

  const context_files = Array.isArray(keywords) && keywords.length
    ? getContextFilesForKeywords(keywords)
    : getContextFiles();
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
    let content = result.content;
    if (/^---/.test(content)) {
      const end = content.indexOf('\n---', 3);
      if (end > 0) {
        const header = content.slice(3, end).trim();
        const meta = {};
        header.split(/\r?\n/).forEach(l => {
          const m = l.split(':');
          if (m[0]) meta[m[0].trim()] = m.slice(1).join(':').trim();
        });
        if (meta.parts) {
          const list = meta.parts
            .replace(/^\[/, '')
            .replace(/\]$/, '')
            .split(',')
            .map(t => t.trim())
            .filter(Boolean);
          const dir = path.posix.dirname(normalized);
          let full = '';
          for (const p of list) {
            const part_path = path.posix.join(dir, p);
            const part = await get_file(null, repo, token, part_path);
            full += part.content + '\n';
          }
          content = full.trim();
        }
      }
    }
    logger.info('[read_memory_file] success', { path: normalized, source });
    touchIndexEntry(normalized);
    return content;
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
  split_memory_file,
  register_user_prompt: context_state.register_user_prompt,
};
