const fs = require('fs');
const path = require('path');
const { isLocalMode, resolvePath, baseDir } = require('../utils/memory_mode');
const { requestToAgent } = require('./memory_plugin');
const github_client = require('../tools/github_client');
const token_store = require('../tools/token_store');
const memory_config = require('../tools/memory_config');
const index_manager = require('../logic/index_manager');
const {
  touchIndexEntry,
  incrementEditCount,
} = require('../tools/context_priority');
const {
  ensureDir,
  normalizeMemoryPath,
} = require('../tools/file_utils');
const { split_memory_file } = require('../tools/memory_splitter');
const {
  splitMarkdownFile,
  MAX_MD_FILE_SIZE,
} = require('../utils/file_splitter');
const { logError } = require('../tools/error_handler');
const memory_settings = require('../tools/memory_settings');
const { estimate_cost } = require('../tools/text_utils');

async function readMemory(userId, repo, token, filename, opts = {}) {
  const normalized = normalizeMemoryPath(filename);
  const parseJson = opts.parseJson || false;
  const envSkipGit = process.env.NO_GIT === 'true';
  const suppliedRepo = repo;
  const suppliedToken = token;
  let finalRepo = suppliedRepo || (await memory_config.getRepoUrl(userId));
  let finalToken = suppliedToken || (await token_store.getToken(userId));
  if (envSkipGit && !(suppliedRepo && suppliedToken)) {
    finalRepo = null;
    finalToken = null;
  }

  if (isLocalMode(userId || 'default')) {
    const data = await requestToAgent('/read', 'GET', {
      repo: finalRepo,
      token: finalToken,
      filename,
      userId: userId,
    });
    if (parseJson && filename.trim().toLowerCase().endsWith('.json')) {
      try {
        return JSON.parse(data);
      } catch {
        return data;
      }
    }
    return data;
  }

  const masked = finalToken ? `${finalToken.slice(0, 4)}...` : 'null';
  console.log('[readMemory] repo:', finalRepo);
  console.log('[readMemory] token:', masked);
  console.log('[readMemory] file:', normalized);

  let content = null;

  if (finalRepo && finalToken) {
    try {
      content = await github_client.readFile(finalToken, finalRepo, normalized);
    } catch (e) {
      console.error(`[storage.readMemory] GitHub read failed for ${normalized}`, e.message);
    }
  }

  if (!content) {
    const localPath = resolvePath(normalized, userId || 'default');
    if (fs.existsSync(localPath)) {
      content = fs.readFileSync(localPath, 'utf-8');
    } else {
      throw new Error(`File not found: ${normalized}`);
    }
  }

  if (!index_manager.validatePath(normalized)) {
    await index_manager.addOrUpdateEntry({
      path: normalized,
      title: index_manager.generateTitleFromPath(normalized),
      type: index_manager.inferTypeFromPath(normalized),
      lastModified: new Date().toISOString(),
    });
    await index_manager.saveIndex(token, repo, userId);
  }

  if (parseJson && normalized.endsWith('.json')) {
    try {
      return JSON.parse(content);
    } catch (e) {
      console.error(`[storage.readMemory] failed to parse JSON ${normalized}`, e.message);
      throw e;
    }
  }
  return content;
}

async function saveMemory(userId, repo, token, filename, content) {
  if (isLocalMode(userId || 'default')) {
    return requestToAgent('/save', 'POST', {
      repo,
      token,
      filename,
      content,
      userId: userId,
    });
  }
  const normalized = normalizeMemoryPath(filename);
  const parsed = path.posix.parse(normalized);
  if (!parsed.ext) {
    throw new Error(
      `saveMemory expects a file path, got directory: ${filename}`
    );
  }
  const envSkipGit = process.env.NO_GIT === 'true';
  const suppliedRepo = repo;
  const suppliedToken = token;
  let finalRepo = suppliedRepo || (await memory_config.getRepoUrl(userId));
  let finalToken = suppliedToken || (await token_store.getToken(userId));
  if (envSkipGit && !(suppliedRepo && suppliedToken)) {
    finalRepo = null;
    finalToken = null;
  }
  const masked = finalToken ? `${finalToken.slice(0, 4)}...` : 'null';
  console.log('[saveMemory] repo:', finalRepo);
  console.log('[saveMemory] token:', masked);
  console.log('[saveMemory] file:', normalized);
  const tokens = estimate_cost(content, 'tokens');
  if (tokens > memory_settings.token_soft_limit) {
    console.warn('[saveMemory] token limit reached', tokens);
    if (memory_settings.enforce_soft_limit) {
      return {
        warning: 'This file is too large for safe future use.',
      };
    } else {
      const parts = await split_memory_file(normalized, memory_settings.max_tokens_per_file);
      return { split: true, parts };
    }
  }
  const localPath = resolvePath(normalized, userId || 'default');
  ensureDir(localPath);
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
      path.relative(baseDir(userId || 'default'), p).replace(/\\/g, '/')
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

async function saveMemoryWithIndex(userId, repo, token, filename, content) {
  if (isLocalMode(userId || 'default')) {
    return requestToAgent('/saveMemoryWithIndex', 'POST', {
      repo,
      token,
      filename,
      content,
      userId: userId,
    });
  }
  const check = await index_manager.validateFilePathAgainstIndex(filename);
  if (check.warning) console.warn(`[index] ${check.warning}`);
  const finalPath = check.expectedPath || filename;
  const tokens = estimate_cost(content, 'tokens');
  if (tokens > memory_settings.token_soft_limit) {
    console.warn('[saveMemory_with_index] token limit reached', tokens);
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
    const abs = resolvePath(normalizeMemoryPath(finalPath), userId || 'default');
    ensureDir(abs);
    fs.writeFileSync(abs, content, 'utf-8');
    const parts = splitMarkdownFile(abs, MAX_MD_FILE_SIZE);
    fs.unlinkSync(abs);
    const relParts = parts.map(p =>
      path.relative(baseDir(userId || 'default'), p).replace(/\\/g, '/')
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
  const savedPath = await saveMemory(userId, repo, token, finalPath, content);
  if (
    savedPath &&
    typeof savedPath === 'object' &&
    savedPath.split &&
    Array.isArray(savedPath.parts)
  ) {
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
  const result2 = await index_manager.saveIndex(token, repo, userId);
  if (result2 && result2.warning) {
    console.warn(`[index] ${result2.warning}`);
  }

  return savedPathStr;
}

async function getFile(userId, repo, token, filename) {
  const isJson = filename.trim().toLowerCase().endsWith('.json');
  try {
    const content = await readMemory(userId, repo, token, filename);
    if (isJson) {
      try {
        const json = JSON.parse(content);
        return { content, json };
      } catch (e) {
        logError('getFile parse json', e);
        return { content, json: null };
      }
    }
    return { content };
  } catch (e) {
    logError('getFile', e);
    throw e;
  }
}

module.exports = {
  // New camelCase names
  readMemory,
  saveMemory,
  saveMemoryWithIndex,
  getFile,
  addOrUpdateEntry: index_manager.addOrUpdateEntry,
  saveIndex: index_manager.saveIndex,

  // Backward compatibility (deprecated)
  read_memory: readMemory,
  save_memory: saveMemory,
  save_memory_with_index: saveMemoryWithIndex,
  get_file: getFile,
};
