const config = require('./config');

function loadConfig() {
  return config.loadConfig();
}

function getPluginRepo() {
  return config.getPluginRepo();
}

function getStudentRepo() {
  return config.getStudentRepo();
}

module.exports = {
  loadConfig,
  getPluginRepo,
  getStudentRepo,
};
