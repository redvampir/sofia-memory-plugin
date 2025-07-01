const fs = require('fs');
const axios = require('axios');
const memory_config = require('../tools/memory_config');
const token_store = require('../tools/token_store');
const { contextFilename } = require('../logic/memory_operations');
const logger = require('./logger');

const CHECK_INTERVAL_MS = 30 * 60 * 1000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 1000;
const DEFAULT_CONTEXT_FILE = 'memory/context/autocontext-index.md';
const PORT = process.env.PORT || 10000;

function context_exists() {
  try {
    const data = fs.readFileSync(contextFilename(), 'utf-8');
    return data.trim().length > 0;
  } catch {
    return false;
  }
}

async function restore_context(user_id) {
  try {
    const repo = await memory_config.getRepoUrl(user_id);
    const token = await token_store.getToken(user_id);
    const headers = token ? { Authorization: `token ${token}` } : {};
    await axios.post(
      `http://localhost:${PORT}/loadMemoryToContext`,
      { filename: DEFAULT_CONTEXT_FILE, repo, userId: user_id },
      { headers }
    );
    logger.info('[context_checker] context restored', { user: user_id });
  } catch (e) {
    logger.error('[context_checker] restore failed', e.message);
  }
}

const lastChecked = {};

function should_check(id) {
  const last = lastChecked[id] || 0;
  return Date.now() - last > CACHE_TTL_MS;
}

function mark_checked(id) {
  lastChecked[id] = Date.now();
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function check_context() {
  if (context_exists()) return;
  const users = await memory_config.getAllUsers();
  if (!users.length) users.push(null);
  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE);
    for (const id of batch) {
      if (!should_check(id)) continue;
      await restore_context(id);
      mark_checked(id);
    }
    if (i + BATCH_SIZE < users.length) {
      await delay(BATCH_DELAY_MS);
    }
  }
}

function start_context_checker() {
  setInterval(check_context, CHECK_INTERVAL_MS);
}

module.exports = { start_context_checker, check_context };
