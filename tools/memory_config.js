/**
 * Save and retrieve repository addresses for users
 */
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { getDefaultUserId } = require('../utils/default_user');

const cacheDir = path.join(__dirname, '.cache');
const reposDir = path.join(cacheDir, 'repos');
const repoCache = {};

/**
 * Ensure cache directory exists
 */
async function ensureDir() {
  try {
    await fsp.mkdir(reposDir, { recursive: true });
  } catch {
    // Directory already exists
  }
}

/**
 * Get file path for user's repo config
 * @param {string} userId
 * @returns {string}
 */
function repoPath(userId) {
  return path.join(reposDir, `${userId}.txt`);
}

/**
 * Load repository URL from cache or disk
 * @param {string} userId
 * @returns {Promise<string|null>}
 */
async function loadRepo(userId) {
  if (Object.prototype.hasOwnProperty.call(repoCache, userId)) {
    return repoCache[userId];
  }

  const file = repoPath(userId);
  try {
    const data = await fsp.readFile(file, 'utf-8');
    repoCache[userId] = data.trim() || null;
  } catch {
    repoCache[userId] = null;
  }

  return repoCache[userId];
}

/**
 * Save repository URL to disk
 * @param {string} userId
 * @param {string|null} url
 */
async function saveRepo(userId, url) {
  await ensureDir();
  const file = repoPath(userId);

  try {
    if (url) {
      await fsp.writeFile(file, url, 'utf-8');
    } else {
      await fsp.unlink(file).catch(() => {});
    }
  } catch (e) {
    console.error(`[memoryConfig] failed to save repo url for ${userId}`, e.message);
  }
}

/**
 * Set repository URL for a user
 * @param {string} userId
 * @param {string|null} url
 */
exports.setRepoUrl = async (userId, url) => {
  repoCache[userId] = url || null;
  await saveRepo(userId, url);
};

/**
 * Get repository URL for a user
 * @param {string} userId
 * @returns {Promise<string|null>}
 */
exports.getRepoUrl = userId => loadRepo(userId);

/**
 * Get all known user IDs
 * @returns {Promise<string[]>}
 */
exports.getAllUsers = async () => {
  try {
    await fsp.access(reposDir);
  } catch {
    return [getDefaultUserId()];
  }

  const files = await fsp.readdir(reposDir);
  const users = files.map(f => path.basename(f, '.txt'));

  if (!users.includes(getDefaultUserId())) {
    users.push(getDefaultUserId());
  }

  return users;
};
