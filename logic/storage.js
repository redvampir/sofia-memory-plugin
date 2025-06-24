const fs = require('fs');
const path = require('path');
const github_client = require('../tools/github_client');
const token_store = require('../tools/token_store');
const memory_config = require('../tools/memory_config');
const index_manager = require('./index_manager');
const {
  ensure_dir,
  normalize_memory_path,
} = require('../tools/file_utils');
const { logError } = require('../tools/error_handler');

async function read_memory(user_id, repo, token, filename, opts = {}) {
  const normalized = normalize_memory_path(filename);
  const parse_json = opts.parseJson || false;
  const finalRepo = repo || memory_config.getRepoUrl(user_id);
  const finalToken = token || token_store.getToken(user_id);

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
  const finalRepo = repo || memory_config.getRepoUrl(user_id);
  const finalToken = token || token_store.getToken(user_id);
  const masked = finalToken ? `${finalToken.slice(0, 4)}...` : 'null';
  console.log('[save_memory] repo:', finalRepo);
  console.log('[save_memory] token:', masked);
  console.log('[save_memory] file:', normalized);
  const localPath = path.join(__dirname, '..', normalized);
  ensure_dir(localPath);
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
      console.error(`[storage.saveMemory] GitHub write failed for ${normalized}`, e.message);
    }
  }
  return normalized;
}

async function save_memory_with_index(user_id, repo, token, filename, content) {
  const savedPath = await save_memory(user_id, repo, token, filename, content);
  await index_manager.addOrUpdateEntry({
    path: savedPath,
    title: index_manager.generateTitleFromPath(savedPath),
    type: index_manager.inferTypeFromPath(savedPath),
    lastModified: new Date().toISOString(),
  });
  await index_manager.saveIndex(token, repo, user_id);
  return savedPath;
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
