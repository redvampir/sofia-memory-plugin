const { read_memory, save_memory } = require('./logic/storage');
const { restore_context } = require('./context');
const memory_config = require('./tools/memory_config');
const token_store = require('./tools/token_store');

async function readMemory(repo, token, filename) {
  return read_memory(null, repo, token, filename);
}

async function saveMemory(repo, token, filename, content) {
  return save_memory(null, repo, token, filename, content);
}

function setMemoryRepo(token, repo) {
  const userId = null;
  if (token !== undefined) token_store.setToken(userId, token);
  if (repo !== undefined) memory_config.setRepoUrl(userId, repo);
}

async function refreshContextFromMemoryFiles(repo, token) {
  return restore_context(false, { userId: null, repo, token });
}

module.exports = {
  readMemory,
  saveMemory,
  refreshContextFromMemoryFiles,
  setMemoryRepo,
};
