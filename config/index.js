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

function getPluginRepo() {
  const fileCfg = loadFromFile().pluginRepo || {};
  return {
    repo: process.env.PLUGIN_REPO || fileCfg.repo || null,
    token: process.env.PLUGIN_TOKEN || fileCfg.token || null,
  };
}

function getStudentRepo() {
  const fileCfg = loadFromFile().studentRepo || {};
  return {
    repo: process.env.STUDENT_REPO || fileCfg.repo || null,
    token: process.env.STUDENT_TOKEN || fileCfg.token || null,
  };
}

function getMirrorNeurons() {
  const list = loadFromFile().mirrorNeurons;
  return Array.isArray(list) ? list : [];
}

function loadConfig() {
  return {
    pluginRepo: getPluginRepo(),
    studentRepo: getStudentRepo(),
    mirrorNeurons: getMirrorNeurons(),
  };
}

module.exports = { loadConfig, getPluginRepo, getStudentRepo, getMirrorNeurons };
