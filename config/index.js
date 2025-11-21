const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// load .env file if present
dotenv.config();

const configFile = path.join(__dirname, 'config.json');
let cached = null;

function loadFromFile() {
  if (cached !== null) return cached;
  try {
    const raw = fs.readFileSync(configFile, 'utf-8');
    cached = JSON.parse(raw);
  } catch {
    cached = {};
  }
  return cached;
}

function getEnvPluginDefaults() {
  return {
    repo: process.env.REPO || process.env.GITHUB_REPO || null,
    token: process.env.GITHUB_TOKEN || null,
  };
}

function getEnvStudentDefaults() {
  const repo =
    process.env.STUDENT_REPO ||
    process.env.STUDENT_GITHUB_REPO ||
    process.env.REPO ||
    process.env.GITHUB_REPO ||
    null;
  const token =
    process.env.STUDENT_GITHUB_TOKEN || process.env.GITHUB_TOKEN || null;
  return { repo, token };
}

function getPluginRepo() {
  const fileCfg = loadFromFile().pluginRepo || {};
  const envDefaults = getEnvPluginDefaults();
  return {
    repo: envDefaults.repo || fileCfg.repo || null,
    token: envDefaults.token || fileCfg.token || null,
  };
}

function getStudentRepo() {
  const fileCfg = loadFromFile().studentRepo || {};
  const envDefaults = getEnvStudentDefaults();
  return {
    repo: envDefaults.repo || fileCfg.repo || null,
    token: envDefaults.token || fileCfg.token || null,
  };
}

function getMirrorNeurons() {
  const list = loadFromFile().mirrorNeurons;
  return Array.isArray(list) ? list : [];
}

function parsePositiveInteger(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (num <= 0) return null;
  return Math.floor(num);
}

function normalizeMemoryMode(value) {
  if (!value || typeof value !== 'string') return null;
  return value.trim().toLowerCase();
}

function getMemoryConfig() {
  const fileCfg = loadFromFile().memory || {};
  const envLimit = parsePositiveInteger(
    process.env.MAX_STORE_TOKENS || process.env.MEMORY_V2_MAX_TOKENS,
  );
  const fileLimit = parsePositiveInteger(fileCfg.maxStoreTokens);
  const fallbackLimit = 4096;

  const envMode = normalizeMemoryMode(
    process.env.MODE || process.env.MEMORY_MODE,
  );
  const fileMode = normalizeMemoryMode(fileCfg.mode);
  const fallbackMode = 'github';

  return {
    mode: envMode ?? fileMode ?? fallbackMode,
    maxStoreTokens: envLimit ?? fileLimit ?? fallbackLimit,
  };
}

function getMemoryLimits() {
  return getMemoryConfig();
}

function getDefaultUserId() {
  const fileCfg = loadFromFile() || {};
  return process.env.DEFAULT_USER_ID || fileCfg.defaultUserId || 'default';
}

function loadConfig() {
  return {
    pluginRepo: getPluginRepo(),
    studentRepo: getStudentRepo(),
    mirrorNeurons: getMirrorNeurons(),
    memory: getMemoryConfig(),
    defaultUserId: getDefaultUserId(),
  };
}

module.exports = {
  loadConfig,
  getPluginRepo,
  getStudentRepo,
  getEnvPluginDefaults,
  getEnvStudentDefaults,
  getMirrorNeurons,
  getMemoryConfig,
  getMemoryLimits,
  getDefaultUserId,
};
