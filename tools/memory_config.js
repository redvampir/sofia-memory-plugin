// Сохраняем и читаем адреса репозиториев для пользователей
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { getDefaultUserId } = require('../utils/default_user');

const cacheDir = path.join(__dirname, '.cache');
const reposDir = path.join(cacheDir, 'repos');
const repoCache = {};

async function ensure_dir() {
  try {
    await fsp.mkdir(reposDir, { recursive: true });
  } catch {}
}

function repoPath(userId) {
  return path.join(reposDir, `${userId}.txt`);
}

async function loadRepo(userId) {
  if (Object.prototype.hasOwnProperty.call(repoCache, userId)) {
    return repoCache[userId];
  }
  const file = repoPath(userId);
  try {
    const data = await fsp.readFile(file, 'utf-8');
    repoCache[userId] = data.trim() || null;
  } catch {
    repoCache[userId] = null;
  }
  return repoCache[userId];
}

async function saveRepo(userId, url) {
  await ensure_dir();
  const file = repoPath(userId);
  try {
    if (url) {
      await fsp.writeFile(file, url, 'utf-8');
    } else {
      await fsp.unlink(file).catch(() => {});
    }
  } catch (e) {
    console.error(`[memoryConfig] failed to save repo url for ${userId}`, e.message);
  }
}

exports.setRepoUrl = async (userId, url) => {
  repoCache[userId] = url || null;
  await saveRepo(userId, url);
};

exports.getRepoUrl = userId => loadRepo(userId);

exports.getAllUsers = async () => {
  try {
    await fsp.access(reposDir);
  } catch {
    return [getDefaultUserId()];
  }
  const files = await fsp.readdir(reposDir);
  const users = files.map(f => path.basename(f, '.txt'));
  if (!users.includes(getDefaultUserId())) {
    users.push(getDefaultUserId());
  }
  return users;
};
