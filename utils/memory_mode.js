const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const usersDir = path.join(__dirname, '..', 'config', 'users');
const cache = {};

function configPath(userId) {
  return path.join(usersDir, `${userId}.json`);
}

async function ensureDir() {
  await fsp.mkdir(usersDir, { recursive: true });
}

async function getMemoryMode(userId = 'default') {
  await ensureDir();
  if (Object.prototype.hasOwnProperty.call(cache, userId)) {
    return cache[userId];
  }
  try {
    const raw = await fsp.readFile(configPath(userId), 'utf-8');
    const parsed = JSON.parse(raw);
    cache[userId] = (parsed.memory_mode || 'github').toLowerCase();
  } catch {
    cache[userId] = 'github';
  }
  return cache[userId];
}

function getMemoryModeSync(userId = 'default') {
  if (!fs.existsSync(usersDir)) fs.mkdirSync(usersDir, { recursive: true });
  if (Object.prototype.hasOwnProperty.call(cache, userId)) {
    return cache[userId];
  }
  try {
    const raw = fs.readFileSync(configPath(userId), 'utf-8');
    const parsed = JSON.parse(raw);
    cache[userId] = (parsed.memory_mode || 'github').toLowerCase();
  } catch {
    cache[userId] = 'github';
  }
  return cache[userId];
}

async function setMemoryMode(userId = 'default', mode = 'github') {
  mode = (mode || 'github').toLowerCase();
  await ensureDir();
  await fsp.writeFile(configPath(userId), JSON.stringify({ memory_mode: mode }, null, 2));
  cache[userId] = mode;
}

function isLocalMode(userId = 'default') {
  return getMemoryModeSync(userId) === 'local';
}

function baseDir(userId = 'default') {
  if (isLocalMode(userId)) {
    return path.join(__dirname, '..', 'local_memory', userId);
  }
  return path.join(__dirname, '..');
}

function resolvePath(relPath, userId = 'default') {
  return path.join(baseDir(userId), relPath);
}

module.exports = {
  getMemoryMode,
  getMemoryModeSync,
  setMemoryMode,
  isLocalMode,
  baseDir,
  resolvePath,
};
