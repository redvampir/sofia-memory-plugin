const fs = require('fs');
const path = require('path');
const github = require('../utils/githubClient');
const tokenStore = require('../utils/tokenStore');
const memoryConfig = require('../utils/memoryConfig');
const indexManager = require('./indexManager');
const {
  ensureDir,
  normalizeMemoryPath,
} = require('../utils/fileUtils');
const { logError } = require('../utils/errorHandler');

async function readMemory(userId, repo, token, filename, opts = {}) {
  const normalized = normalizeMemoryPath(filename);
  const parseJson = opts.parseJson || false;
  const finalRepo = repo || memoryConfig.getRepoUrl(userId);
  const finalToken = token || tokenStore.getToken(userId);

  let content = null;

  if (finalRepo && finalToken) {
    try {
      content = await github.readFile(finalToken, finalRepo, normalized);
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
  const normalized = normalizeMemoryPath(filename);
  const finalRepo = repo || memoryConfig.getRepoUrl(userId);
  const finalToken = token || tokenStore.getToken(userId);
  const localPath = path.join(__dirname, '..', normalized);
  ensureDir(localPath);
  fs.writeFileSync(localPath, content, 'utf-8');

  if (finalRepo && finalToken) {
    try {
      await github.writeFileSafe(
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

async function saveMemoryWithIndex(userId, repo, token, filename, content) {
  const savedPath = await saveMemory(userId, repo, token, filename, content);
  await indexManager.addOrUpdateEntry({
    path: savedPath,
    title: indexManager.generateTitleFromPath(savedPath),
    type: indexManager.inferTypeFromPath(savedPath),
    lastModified: new Date().toISOString(),
  });
  await indexManager.saveIndex(token, repo, userId);
  return savedPath;
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
  readMemory,
  saveMemory,
  saveMemoryWithIndex,
  getFile,
  addOrUpdateEntry: indexManager.addOrUpdateEntry,
  saveIndex: indexManager.saveIndex,
};
