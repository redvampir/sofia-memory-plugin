const fs = require('fs');
const axios = require('axios');
const memoryConfig = require('../tools/memory_config');
const tokenStore = require('../tools/token_store');
const { contextFilename } = require('../logic/memory_operations');
const logger = require('./logger');

const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const CACHE_TTL_MS = 5 * 60 * 1000;       // 5 minutes
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 1000;
const DEFAULT_CONTEXT_FILE = 'memory/context/autocontext-index.md';
const PORT = process.env.PORT || 10000;

/**
 * Check if context file exists and is not empty
 * @returns {boolean}
 */
function contextExists() {
  try {
    const data = fs.readFileSync(contextFilename(), 'utf-8');
    return data.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Restore context for a user by loading default context file
 * @param {string} userId - User identifier
 */
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

/**
 * Check if user should be checked based on cache TTL
 * @param {string} id - User identifier
 * @returns {boolean}
 */
function shouldCheck(id) {
  const last = lastChecked[id] || 0;
  return Date.now() - last > CACHE_TTL_MS;
}

/**
 * Mark user as checked
 * @param {string} id - User identifier
 */
function markChecked(id) {
  lastChecked[id] = Date.now();
}

/**
 * Delay helper
 * @param {number} ms - Milliseconds to wait
 */
async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check and restore context for all users in batches
 */
async function checkContext() {
  if (contextExists()) return;

  let users = await memoryConfig.getAllUsers();
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

/**
 * Start periodic context checker
 */
function startContextChecker() {
  setInterval(checkContext, CHECK_INTERVAL_MS);
  logger.info('[context_checker] Started with interval:', CHECK_INTERVAL_MS);
}

module.exports = {
  startContextChecker,
  checkContext,
  contextExists,
  restoreContext,

  // Backward compatibility - deprecated
  start_context_checker: startContextChecker,
  check_context: checkContext,
};
