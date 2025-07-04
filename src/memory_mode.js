const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const cfgDir = path.join(__dirname, '..', 'config', '.sofia');
const cfgPath = path.join(cfgDir, 'config.json');

function loadConfigSync() {
  try {
    const raw = fs.readFileSync(cfgPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function loadConfig() {
  try {
    const raw = await fsp.readFile(cfgPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveConfigSync(cfg) {
  fs.mkdirSync(cfgDir, { recursive: true });
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
}

async function saveConfig(cfg) {
  await fsp.mkdir(cfgDir, { recursive: true });
  await fsp.writeFile(cfgPath, JSON.stringify(cfg, null, 2));
}

function getMemoryModeSync() {
  const cfg = loadConfigSync();
  return (cfg.memory_mode || 'github').toLowerCase();
}

async function getMemoryMode() {
  const cfg = await loadConfig();
  return (cfg.memory_mode || 'github').toLowerCase();
}

function setMemoryModeSync(mode = 'github') {
  const cfg = loadConfigSync();
  cfg.memory_mode = (mode || 'github').toLowerCase();
  saveConfigSync(cfg);
}

async function setMemoryMode(mode = 'github') {
  const cfg = await loadConfig();
  cfg.memory_mode = (mode || 'github').toLowerCase();
  await saveConfig(cfg);
}

module.exports = {
  getMemoryMode,
  getMemoryModeSync,
  setMemoryMode,
  setMemoryModeSync,
  configPath: cfgPath,
};
