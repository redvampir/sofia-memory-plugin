// Сохраняем и читаем адреса репозиториев для пользователей
const fs = require('fs');
const path = require('path');

const cacheDir = path.join(__dirname, '.cache');
const reposDir = path.join(cacheDir, 'repos');
const repoCache = {};

function ensure_dir() {
  if (!fs.existsSync(reposDir)) {
    fs.mkdirSync(reposDir, { recursive: true });
  }
}

function repoPath(userId) {
  return path.join(reposDir, `${userId}.txt`);
}

function loadRepo(userId) {
  if (Object.prototype.hasOwnProperty.call(repoCache, userId)) {
    return repoCache[userId];
  }
  const file = repoPath(userId);
  if (fs.existsSync(file)) {
    try {
      const data = fs.readFileSync(file, 'utf-8').trim();
      repoCache[userId] = data || null;
    } catch (e) {
      repoCache[userId] = null;
    }
  } else {
    repoCache[userId] = null;
  }
  return repoCache[userId];
}

function saveRepo(userId, url) {
  ensure_dir();
  const file = repoPath(userId);
  try {
    if (url) {
      fs.writeFileSync(file, url, 'utf-8');
    } else if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  } catch (e) {
    console.error(`[memoryConfig] failed to save repo url for ${userId}`, e.message);
  }
}

exports.setRepoUrl = (userId, url) => {
  repoCache[userId] = url || null;
  saveRepo(userId, url);
};

exports.getRepoUrl = userId => loadRepo(userId);

exports.getAllUsers = () => {
  if (!fs.existsSync(reposDir)) return [];
  return fs.readdirSync(reposDir).map(f => path.basename(f, '.txt'));
};
