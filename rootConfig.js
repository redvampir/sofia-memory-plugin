const fs = require('fs');
const path = require('path');

const configFile = path.join(__dirname, 'config.json');
let cached = undefined;

function loadConfig() {
  if (cached !== undefined) return cached;
  if (fs.existsSync(configFile)) {
    try {
      const raw = fs.readFileSync(configFile, 'utf-8');
      cached = JSON.parse(raw);
    } catch {
      cached = null;
    }
  } else {
    cached = null;
  }
  return cached;
}

function getPluginRepo() {
  const cfg = loadConfig();
  return cfg && cfg.pluginRepo ? cfg.pluginRepo : null;
}

function getStudentRepo() {
  const cfg = loadConfig();
  return cfg && cfg.studentRepo ? cfg.studentRepo : null;
}

module.exports = {
  loadConfig,
  getPluginRepo,
  getStudentRepo,
};
