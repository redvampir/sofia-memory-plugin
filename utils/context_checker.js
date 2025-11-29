const fs = require('fs');
const axios = require('axios');
const memoryConfig = require('../tools/memory_config');
const tokenStore = require('../tools/token_store');
const { contextFilename } = require('../logic/memory_operations');
const logger = require('./logger');

const CHECK_INTERVAL_MS = 30 * 60 * 1000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 1000;
const DEFAULT_CONTEXT_FILE = 'memory/context/autocontext-index.md';
const PORT = process.env.PORT || 10000;

function contextExists() {
  try {
    const data = fs.readFileSync(contextFilename(), 'utf-8');
    return data.trim().length > 0;
  } catch {
    return false;
  }
}

async function restoreContext(userId) {
  try {
    const repo = await memoryConfig.getRepoUrl(userId);
    const token = await tokenStore.getToken(userId);
    const headers = token ? { Authorization: `token ${token}` } : {};
    await axios.post(
      `http://localhost:${PORT}/loadMemoryToContext`,
      { filename: DEFAULT_CONTEXT_FILE, repo, userId },
      { headers }
    );
    logger.info('[context_checker] context restored', { user: userId });
  } catch (e) {
    logger.error('[context_checker] restore failed', e.message);
  }
}

const lastChecked = {};

function shouldCheck(id) {
  const last = lastChecked[id] || 0;
  return Date.now() - last > CACHE_TTL_MS;
}

function markChecked(id) {
  lastChecked[id] = Date.now();
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkContext() {
  if (contextExists()) return;
  const users = await memoryConfig.getAllUsers();
  if (!users.length) users.push(null);
  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE);
    for (const id of batch) {
      if (!shouldCheck(id)) continue;
      await restoreContext(id);
      markChecked(id);
    }
    if (i + BATCH_SIZE < users.length) {
      await delay(BATCH_DELAY_MS);
    }
  }
}

function startContextChecker() {
  setInterval(checkContext, CHECK_INTERVAL_MS);
}

module.exports = { startContextChecker, checkContext };
