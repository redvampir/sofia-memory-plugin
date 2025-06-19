const fs = require('fs');
const path = require('path');

const cacheDir = path.join(__dirname, '.cache');
const repoFile = path.join(cacheDir, 'repo.txt');
let repoUrl = null;

function ensureDir() {
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
}

function loadRepo() {
  if (repoUrl !== null) return repoUrl;
  if (fs.existsSync(repoFile)) {
    try {
      const data = fs.readFileSync(repoFile, 'utf-8').trim();
      repoUrl = data || null;
    } catch (e) {
      repoUrl = null;
    }
  }
  return repoUrl;
}

function saveRepo(url) {
  ensureDir();
  try {
    if (url) {
      fs.writeFileSync(repoFile, url, 'utf-8');
    } else if (fs.existsSync(repoFile)) {
      fs.unlinkSync(repoFile);
    }
  } catch (e) {
    console.error('[memoryConfig] failed to save repo url', e.message);
  }
}

exports.setRepoUrl = url => {
  repoUrl = url || null;
  saveRepo(url);
};

exports.getRepoUrl = () => loadRepo();
