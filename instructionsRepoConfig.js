const fs = require('fs');
const path = require('path');

const cacheDir = path.join(__dirname, '.cache');
const configFile = path.join(cacheDir, 'instructionsRepo.json');

let config = {
  pluginRepo: 'sofia-memory-plugin',
  pluginToken: null,
  studentRepo: null,
  studentToken: null,
  active: 'plugin'
};

function load() {
  if (config._loaded) return;
  if (fs.existsSync(configFile)) {
    try {
      const raw = fs.readFileSync(configFile, 'utf-8');
      const data = JSON.parse(raw);
      config = { ...config, ...data };
    } catch (e) {
      // ignore
    }
  }
  config._loaded = true;
}

function save() {
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf-8');
}

exports.setPluginRepoConfig = (repo, token) => {
  load();
  if (repo) config.pluginRepo = repo;
  if (token !== undefined) config.pluginToken = token;
  save();
};

exports.setStudentRepoConfig = (repo, token) => {
  load();
  if (repo) config.studentRepo = repo;
  if (token !== undefined) config.studentToken = token;
  save();
};

exports.getPluginRepoConfig = () => {
  load();
  return { repo: config.pluginRepo, token: config.pluginToken };
};

exports.getStudentRepoConfig = () => {
  load();
  return { repo: config.studentRepo, token: config.studentToken };
};

exports.setRepoContext = ctx => {
  load();
  if (ctx === 'plugin' || ctx === 'student') {
    config.active = ctx;
    console.log(`[repoContext] active -> ${ctx}`);
    save();
  }
};

exports.getRepoContext = () => {
  load();
  return config.active;
};

exports.getActiveRepoConfig = () => {
  load();
  return config.active === 'student'
    ? { repo: config.studentRepo, token: config.studentToken }
    : { repo: config.pluginRepo, token: config.pluginToken };
};
