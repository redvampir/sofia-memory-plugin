const { read_memory, save_memory, get_file } = require('./logic/storage');
const { restore_context, maybeRestoreContext } = require('./context');
const { getContextFiles, getContextFilesForKeywords } = require('./logic/index_manager');
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
const index_tree = require('./tools/index_tree');
const { split_memory_file } = require('./tools/memory_splitter');
const memory_settings = require('./tools/memory_settings');
const fs = require('fs');
const {
  ensureContext,
  contextFilename,
} = require('./logic/memory_operations');

function count_tokens(text = '') {
  return String(text).split(/\s+/).filter(Boolean).length;
}

async function autoRefreshContext(repo, token) {
  if (context_state.get_needs_refresh()) {
    await refreshContextFromMemoryFiles(repo, token);
    logger.info('🔄 Context refreshed from memory repo');
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

  logger.info('[readMemory] params', { repo: final_repo, token: masked_token, filename });

  if (final_repo && !final_token) {
    throw new Error('API access is not possible due to missing token');
  }

  let target = filename;

  if (!target) {
    try {
      const list = index_tree.listAllEntries();
      const first = list.find(e => /lesson/i.test(e.path)) || list[0];
      target = first ? first.path : null;
    } catch (e) {
      logger.error('[readMemory] index lookup failed', e.message);
    }
  } else if (!target.startsWith('memory/')) {
    try {
      const found = index_tree.findEntryByTitle(target) || index_tree.findEntryByPath(target);
      if (found) target = found.path;
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
    logger.debug('[readMemory] url', url);
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
    logger.info('[saveMemory] token limit reached', tokens);
    if (memory_settings.enforce_soft_limit) {
      return {
        warning: 'This file is too large for safe future use.',
      };
    } else {
      const parts = await split_memory_file(filename, memory_settings.max_tokens_per_file);
      logger.info('[saveMemory] auto split due to soft limit', { parts });
      return { split: true, parts };
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
      const list = index_tree.listAllEntries();
      const first = list.find(e => /lesson/i.test(e.path)) || list[0];
      target = first ? first.path : null;
    } catch (e) {
      logger.error('[readMarkdownFile] index lookup failed', e.message);
    }
  } else if (!target.startsWith('memory/')) {
    try {
      const found = index_tree.findEntryByTitle(target) || index_tree.findEntryByPath(target);
      if (found) target = found.path;
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

function parse_front_matter(text = '') {
  if (!text.startsWith('---')) return {};
  const end = text.indexOf('\n---', 3);
  if (end < 0) return {};
  const header = text.slice(3, end).trim();
  const meta = {};
  header.split(/\r?\n/).forEach(l => {
    const m = l.split(':');
    if (m[0]) meta[m[0].trim()] = m.slice(1).join(':').trim();
  });
  return meta;
}

function parse_auto_index(text = '') {
  const meta = parse_front_matter(text);
  if (!meta.files) {
    const lines = text.split(/\r?\n/);
    const idx = lines.findIndex(l => /^files:\s*/i.test(l.trim()));
    if (idx >= 0) {
      const arr = [];
      for (let i = idx + 1; i < lines.length; i++) {
        const ln = lines[i];
        if (/^\s*-\s+/.test(ln)) {
          arr.push(ln.replace(/^\s*-\s+/, '').trim());
        } else if (/^[\w_-]+:\s*/.test(ln.trim())) {
          break;
        }
      }
      if (arr.length) meta.files = arr;
    }
  } else if (typeof meta.files === 'string') {
    meta.files = meta.files
      .replace(/^\[/, '')
      .replace(/\]$/, '')
      .split(/,|\r?\n/)
      .map(t => t.replace(/^\s*-\s*/, '').trim())
      .filter(Boolean);
  }
  return meta;
}

async function load_memory_to_context(filename, repo, token) {
  const normalized = normalize_memory_path(filename);
  const content = await read_memory_file(normalized, {
    repo,
    token,
    source: 'manual-load',
  });
  await ensureContext();
  fs.appendFileSync(contextFilename, `${content}\n`);
  return { file: normalized, tokens: count_tokens(content) };
}

async function load_context_from_index(index_path, repo, token) {
  const normalized = normalize_memory_path(index_path);
  const abs = path.join(__dirname, normalized);
  if (!fs.existsSync(abs)) throw new Error('Index not found');
  const raw = fs.readFileSync(abs, 'utf-8');
  const meta = parse_auto_index(raw);
  const files = Array.isArray(meta.files) ? meta.files : [];
  if (!files.length) return null;
  const loaded = [];
  let full = '';
  for (const f of files) {
    const rel = f.startsWith('memory/') ? f : `memory/${f}`;
    try {
      const c = await read_memory_file(rel, {
        repo,
        token,
        source: 'index-load',
      });
      full += `${c}\n`;
      loaded.push(rel);
    } catch (e) {
      logger.error('[load_context_from_index] failed', {
        path: rel,
        error: e.message,
      });
    }
  }
  if (!loaded.length) return null;
  await ensureContext();
  fs.writeFileSync(contextFilename, full.trim() + '\n');
  return { files: loaded, content: full.trim() };
}

async function auto_recover_context() {
  const targets = new Set();
  const scan = dir => {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir, { withFileTypes: true }).forEach(ent => {
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) return scan(abs);
      if (!ent.name.endsWith('.md')) return;
      const raw = fs.readFileSync(abs, 'utf-8');
      const meta = parse_front_matter(raw);
      if ((meta.context_priority || '').toLowerCase() === 'high') {
        targets.add(path.relative(__dirname, abs).replace(/\\/g, '/'));
      }
    });
  };
  scan(path.join(__dirname, 'memory', 'lessons'));
  scan(path.join(__dirname, 'memory', 'context'));

  const indexVariants = [
    path.join(__dirname, 'memory', 'context', 'autocontext-index.md'),
    path.join(__dirname, 'memory', 'autocontext-index.md'),
  ];
  for (const idx of indexVariants) {
    if (!fs.existsSync(idx)) continue;
    const raw = fs.readFileSync(idx, 'utf-8');
    const meta = parse_auto_index(raw);
    if ((meta.context_priority || '').toLowerCase() === 'high') {
      (meta.files || []).forEach(p => {
        const rel = p.startsWith('memory/') ? p : `memory/${p}`;
        targets.add(rel);
      });
    } else if (meta.related_files) {
      meta.related_files
        .replace(/^\[/, '')
        .replace(/\]$/, '')
        .split(',')
        .map(t => t.trim())
        .filter(Boolean)
        .forEach(p => {
          const rel = p.startsWith('memory/') ? p : `memory/${p}`;
          targets.add(rel);
        });
    }
    break;
  }

  if (!targets.size) return null;

  let full = '';
  const loaded = [];
  for (const p of targets) {
    try {
      const c = await read_memory_file(p, { source: 'auto-recover' });
      full += `${c}\n`;
      loaded.push(p);
    } catch (e) {
      logger.error('[auto_recover_context] failed', { path: p, error: e.message });
    }
  }
  if (!loaded.length) return null;
  await ensureContext();
  fs.writeFileSync(contextFilename, full.trim() + '\n');
  logger.info(`Context restored from: ${loaded.join(', ')}`);
  return { files: loaded, content: full.trim() };
}

async function checkAndRestoreContext(currentStage = '', tokens = 0) {
  context_state.increment_tokens(tokens);
  if (currentStage === 'theory' || currentStage === 'practice') {
    logger.info(`[checkAndRestoreContext] stage finished: ${currentStage}`);
  }
  const result = await maybeRestoreContext();
  if (result.restored) {
    logger.info('[checkAndRestoreContext] context restored from memory');
  }
  return result;
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
  auto_recover_context,
  load_memory_to_context,
  load_context_from_index,
  checkAndRestoreContext,
};
