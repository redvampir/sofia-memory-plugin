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

async function readMemory(userId, repo, token, filename) {
  const normalized = normalizeMemoryPath(filename);
  const finalRepo = repo || memoryConfig.getRepoUrl(userId);
  const finalToken = token || tokenStore.getToken(userId);

  if (finalRepo && finalToken) {
    try {
      return await github.readFile(finalToken, finalRepo, normalized);
    } catch (e) {
      console.error(`[storage.readMemory] GitHub read failed for ${normalized}`, e.message);
    }
  }

  const localPath = path.join(__dirname, '..', normalized);
  if (fs.existsSync(localPath)) {
    return fs.readFileSync(localPath, 'utf-8');
  }
  throw new Error(`File not found: ${normalized}`);
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

module.exports = {
  readMemory,
  saveMemory,
  saveMemoryWithIndex,
  addOrUpdateEntry: indexManager.addOrUpdateEntry,
  saveIndex: indexManager.saveIndex,
};
