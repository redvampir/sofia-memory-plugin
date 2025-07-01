const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

// additional config to store the name of the active memory folder
const sofiaDir = path.join(__dirname, '..', '.sofia');
const sofiaCfgPath = path.join(sofiaDir, 'config.json');

const usersDir = path.join(__dirname, '..', 'config', 'users');
const cache = {};
const pathCache = {};
const baseCache = {};

function configPath(userId) {
  return path.join(usersDir, `${userId}.json`);
}

async function ensureDir() {
  await fsp.mkdir(usersDir, { recursive: true });
}

async function loadConfig(userId) {
  await ensureDir();
  try {
    const raw = await fsp.readFile(configPath(userId), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function loadConfigSync(userId) {
  if (!fs.existsSync(usersDir)) fs.mkdirSync(usersDir, { recursive: true });
  try {
    const raw = fs.readFileSync(configPath(userId), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function loadSofiaConfig() {
  try {
    const raw = fs.readFileSync(sofiaCfgPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function saveSofiaConfig(cfg) {
  await fsp.mkdir(sofiaDir, { recursive: true });
  await fsp.writeFile(sofiaCfgPath, JSON.stringify(cfg, null, 2));
}

async function saveConfig(userId, cfg) {
  await ensureDir();
  await fsp.writeFile(configPath(userId), JSON.stringify(cfg, null, 2));
}

async function getMemoryMode(userId = 'default') {
  if (Object.prototype.hasOwnProperty.call(cache, userId)) {
    return cache[userId];
  }
  const cfg = await loadConfig(userId);
  const mode = (cfg.memory_mode || 'github').toLowerCase();
  cache[userId] = mode;
  pathCache[userId] = cfg.local_path || process.env.LOCAL_MEMORY_PATH || null;
  baseCache[userId] = cfg.base_path || process.env.LOCAL_MEMORY_PATH || null;
  return mode;
}

function getMemoryModeSync(userId = 'default') {
  if (Object.prototype.hasOwnProperty.call(cache, userId)) {
    return cache[userId];
  }
  const cfg = loadConfigSync(userId);
  const mode = (cfg.memory_mode || 'github').toLowerCase();
  cache[userId] = mode;
  pathCache[userId] = cfg.local_path || process.env.LOCAL_MEMORY_PATH || null;
  baseCache[userId] = cfg.base_path || process.env.LOCAL_MEMORY_PATH || null;
  return mode;
}

async function setMemoryMode(userId = 'default', mode = 'github') {
  mode = (mode || 'github').toLowerCase();
  const cfg = await loadConfig(userId);
  cfg.memory_mode = mode;
  await saveConfig(userId, cfg);
  cache[userId] = mode;
}

function isLocalMode(userId = 'default') {
  return getMemoryModeSync(userId) === 'local';
}

function baseDir(userId = 'default') {
  if (isLocalMode(userId)) {
    const custom = getLocalPathSync(userId);
    if (custom) return custom;
    return path.join(process.env.LOCAL_MEMORY_PATH || path.join(__dirname, '..', 'local_memory'), userId);
  }
  return path.join(__dirname, '..');
}

function resolvePath(relPath, userId = 'default') {
  return path.join(baseDir(userId), relPath);
}

function getLocalPathSync(userId = 'default') {
  if (Object.prototype.hasOwnProperty.call(pathCache, userId)) {
    return pathCache[userId];
  }
  const cfg = loadConfigSync(userId);
  const val = cfg.local_path || process.env.LOCAL_MEMORY_PATH || null;
  pathCache[userId] = val;
  baseCache[userId] = cfg.base_path || process.env.LOCAL_MEMORY_PATH || null;
  return val;
}

async function getLocalPath(userId = 'default') {
  if (Object.prototype.hasOwnProperty.call(pathCache, userId)) {
    return pathCache[userId];
  }
  const cfg = await loadConfig(userId);
  const val = cfg.local_path || process.env.LOCAL_MEMORY_PATH || null;
  pathCache[userId] = val;
  baseCache[userId] = cfg.base_path || process.env.LOCAL_MEMORY_PATH || null;
  return val;
}

async function setLocalPath(userId = 'default', dir) {
  const cfg = await loadConfig(userId);
  cfg.base_path = dir;
  cfg.local_path = dir;
  await saveConfig(userId, cfg);
  pathCache[userId] = dir;
  baseCache[userId] = dir;
}

async function setMemoryFolder(userId = 'default', name) {
  const baseDirPath = baseCache[userId] || (await getLocalPath(userId));
  if (!baseDirPath) throw new Error('Local base path not set');
  const target = path.join(baseDirPath, name);
  await fsp.mkdir(target, { recursive: true });
  await fsp.access(target, fs.constants.W_OK);
  const cfg = await loadConfig(userId);
  cfg.local_path = target;
  cfg.base_path = baseDirPath;
  await saveConfig(userId, cfg);
  pathCache[userId] = target;
  baseCache[userId] = baseDirPath;
}

async function switchLocalRepo(userId = 'default', dir) {
  await fsp.mkdir(dir, { recursive: true });
  await fsp.access(dir, fs.constants.W_OK);
  const cfg = await loadConfig(userId);
  cfg.local_path = dir;
  cfg.base_path = path.dirname(dir);
  cfg.memory_mode = 'local';
  await saveConfig(userId, cfg);
  cache[userId] = 'local';
  pathCache[userId] = dir;
  baseCache[userId] = cfg.base_path;
}

async function listMemoryFolders(userId = 'default') {
  const baseDirPath = baseCache[userId] || (await getLocalPath(userId));
  if (!baseDirPath) return [];
  try {
    const items = await fsp.readdir(baseDirPath, { withFileTypes: true });
    return items.filter(i => i.isDirectory()).map(i => i.name);
  } catch {
    return [];
  }
}

async function setActiveMemoryFolder(name) {
  const cfg = loadSofiaConfig();
  cfg.active_folder = name || null;
  await saveSofiaConfig(cfg);
}

function getActiveMemoryFolder() {
  const cfg = loadSofiaConfig();
  return cfg.active_folder || null;
}

async function switchMemoryFolder(userId = 'default', name) {
  await setMemoryFolder(userId, name);
  await setActiveMemoryFolder(name);
  const indexPath = path.join(baseDir(userId), 'memory', 'index.json');
  const planPath = path.join(baseDir(userId), 'memory', 'plan.md');
  let index = null;
  let plan = null;
  try {
    const raw = await fsp.readFile(indexPath, 'utf-8');
    index = JSON.parse(raw);
  } catch {}
  try {
    plan = await fsp.readFile(planPath, 'utf-8');
  } catch {}
  return { index, plan };
}

module.exports = {
  getMemoryMode,
  getMemoryModeSync,
  setMemoryMode,
  isLocalMode,
  baseDir,
  resolvePath,
  getLocalPath,
  getLocalPathSync,
  setLocalPath,
  setMemoryFolder,
  switchLocalRepo,
  listMemoryFolders,
  switchMemoryFolder,
  getActiveMemoryFolder,
}; 
