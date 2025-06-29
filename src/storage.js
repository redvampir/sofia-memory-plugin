const fs = require('fs');
const path = require('path');
const github_client = require('../tools/github_client');
const token_store = require('../tools/token_store');
const memory_config = require('../tools/memory_config');
const index_manager = require('../logic/index_manager');
const {
  touchIndexEntry,
  incrementEditCount,
} = require('../tools/context_priority');
const {
  ensure_dir,
  normalize_memory_path,
} = require('../tools/file_utils');
const { split_memory_file } = require('../tools/memory_splitter');
const {
  splitMarkdownFile,
  MAX_MD_FILE_SIZE,
} = require('../utils/file_splitter');
const { logError } = require('../tools/error_handler');
const memory_settings = require('../tools/memory_settings');
const { estimate_cost } = require('../tools/text_utils');

async function read_memory(user_id, repo, token, filename, opts = {}) {
  const normalized = normalize_memory_path(filename);
  const parse_json = opts.parseJson || false;
  const finalRepo = repo || (await memory_config.getRepoUrl(user_id));
  const finalToken = token || (await token_store.getToken(user_id));

  const masked = finalToken ? `${finalToken.slice(0, 4)}...` : 'null';
  console.log('[read_memory] repo:', finalRepo);
  console.log('[read_memory] token:', masked);
  console.log('[read_memory] file:', normalized);

  let content = null;

  if (finalRepo && finalToken) {
    try {
      content = await github_client.readFile(finalToken, finalRepo, normalized);
    } catch (e) {
      console.error(`[storage.readMemory] GitHub read failed for ${normalized}`, e.message);
    }
  }

  if (!content) {
    const localPath = path.join(__dirname, '..', normalized);
    if (fs.existsSync(localPath)) {
      content = fs.readFileSync(localPath, 'utf-8');
    } else {
      throw new Error(`File not found: ${normalized}`);
    }
  }

  if (parse_json && normalized.endsWith('.json')) {
    try {
      return JSON.parse(content);
    } catch (e) {
      console.error(`[storage.readMemory] failed to parse JSON ${normalized}`, e.message);
      throw e;
    }
  }
  return content;
}

async function save_memory(user_id, repo, token, filename, content) {
  const normalized = normalize_memory_path(filename);
  const finalRepo = repo || (await memory_config.getRepoUrl(user_id));
  const finalToken = token || (await token_store.getToken(user_id));
  const masked = finalToken ? `${finalToken.slice(0, 4)}...` : 'null';
  console.log('[save_memory] repo:', finalRepo);
  console.log('[save_memory] token:', masked);
  console.log('[save_memory] file:', normalized);
  const tokens = estimate_cost(content, 'tokens');
  if (tokens > memory_settings.token_soft_limit) {
    console.warn('[save_memory] token limit reached', tokens);
    if (memory_settings.enforce_soft_limit) {
      return {
        warning: 'This file is too large for safe future use.',
      };
    } else {
      const parts = await split_memory_file(normalized, memory_settings.max_tokens_per_file);
      return { split: true, parts };
    }
  }
  const localPath = path.join(__dirname, '..', normalized);
  ensure_dir(localPath);
  if (fs.existsSync(localPath)) {
    const backup = `${localPath}.bak`;
    fs.copyFileSync(localPath, backup);
  }

  const byteSize = Buffer.byteLength(content, 'utf-8');
  if (byteSize > MAX_MD_FILE_SIZE) {
    fs.writeFileSync(localPath, content, 'utf-8');
    const parts = splitMarkdownFile(localPath, MAX_MD_FILE_SIZE);
    fs.unlinkSync(localPath);
    const relParts = parts.map(p =>
      path.relative(path.join(__dirname, '..'), p).replace(/\\/g, '/')
    );
    return { split: true, parts: relParts };
  }

  fs.writeFileSync(localPath, content, 'utf-8');

  if (finalRepo && finalToken) {
    try {
      await github_client.writeFileSafe(
        finalToken,
        finalRepo,
        normalized,
        content,
        `update ${filename}`
      );
    } catch (e) {
      console.error(
        `[storage.saveMemory] GitHub write failed for ${normalized}`,
        e.message
      );
      throw e;
    }
  }
  await touchIndexEntry(normalized);
  await incrementEditCount(normalized);
  return normalized;
}

async function save_memory_with_index(user_id, repo, token, filename, content) {
  const check = await index_manager.validateFilePathAgainstIndex(filename);
  if (check.warning) console.warn(`[index] ${check.warning}`);
  const finalPath = check.expectedPath || filename;
  const tokens = estimate_cost(content, 'tokens');
  if (tokens > memory_settings.token_soft_limit) {
    console.warn('[save_memory_with_index] token limit reached', tokens);
    if (memory_settings.enforce_soft_limit) {
      return {
        warning: 'This file is too large for safe future use.',
      };
    } else {
      const parts = await split_memory_file(finalPath, memory_settings.max_tokens_per_file);
      return { split: true, parts };
    }
  }
  if (tokens > memory_settings.max_tokens_per_file) {
    const parts = await split_memory_file(finalPath, memory_settings.max_tokens_per_file);
    return { split: true, parts };
  }
  const byteSize = Buffer.byteLength(content, 'utf-8');
  if (byteSize > MAX_MD_FILE_SIZE) {
    const abs = path.join(__dirname, '..', normalize_memory_path(finalPath));
    ensure_dir(abs);
    fs.writeFileSync(abs, content, 'utf-8');
    const parts = splitMarkdownFile(abs, MAX_MD_FILE_SIZE);
    fs.unlinkSync(abs);
    const relParts = parts.map(p =>
      path.relative(path.join(__dirname, '..'), p).replace(/\\/g, '/')
    );
    for (const p of relParts) {
      await index_manager.addOrUpdateEntry({
        path: p,
        title: index_manager.generateTitleFromPath(p),
        type: index_manager.inferTypeFromPath(p),
        lastModified: new Date().toISOString(),
      });
    }
    return { split: true, parts: relParts };
  }
  const savedPath = await save_memory(user_id, repo, token, finalPath, content);
  if (savedPath && savedPath.split) {
    const relParts = savedPath.parts;
    for (const p of relParts) {
      await index_manager.addOrUpdateEntry({
        path: p,
        title: index_manager.generateTitleFromPath(p),
        type: index_manager.inferTypeFromPath(p),
        lastModified: new Date().toISOString(),
      });
    }
    return { split: true, parts: relParts };
  }
  const savedPathStr = savedPath;
  const num = finalPath.match(/(\d+)/);
  if (num) await index_manager.markDuplicateLessons(num[1], savedPathStr);
  await index_manager.addOrUpdateEntry({
    path: savedPathStr,
    title: index_manager.generateTitleFromPath(savedPathStr),
    type: index_manager.inferTypeFromPath(savedPathStr),
    lastModified: new Date().toISOString(),
  });
  const result2 = await index_manager.saveIndex(token, repo, user_id);
  if (result2 && result2.warning) {
    console.warn(`[index] ${result2.warning}`);
  }

  return savedPathStr;
}

async function get_file(user_id, repo, token, filename) {
  const isJson = filename.trim().toLowerCase().endsWith('.json');
  try {
    const content = await read_memory(user_id, repo, token, filename);
    if (isJson) {
      try {
        const json = JSON.parse(content);
        return { content, json };
      } catch (e) {
        logError('get_file parse json', e);
        return { content, json: null };
      }
    }
    return { content };
  } catch (e) {
    logError('get_file', e);
    throw e;
  }
}

module.exports = {
  read_memory,
  save_memory,
  save_memory_with_index,
  get_file,
  addOrUpdateEntry: index_manager.addOrUpdateEntry,
  saveIndex: index_manager.saveIndex,
};
