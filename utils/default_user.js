const rootConfig = require('../config');

function getDefaultUserId() {
  const cfg = rootConfig.loadConfig() || {};
  return process.env.DEFAULT_USER_ID || cfg.defaultUserId || 'default';
}

function resolveUserId(userId) {
  return userId || getDefaultUserId();
}

module.exports = { getDefaultUserId, resolveUserId };
