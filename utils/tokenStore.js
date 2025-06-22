const fs = require('fs');
const path = require('path');

const cacheDir = path.join(__dirname, '.cache');
const tokensDir = path.join(cacheDir, 'tokens');
const tokenCache = {};

function ensureDir() {
  if (!fs.existsSync(tokensDir)) {
    fs.mkdirSync(tokensDir, { recursive: true });
  }
}

function tokenPath(userId) {
  return path.join(tokensDir, `${userId}.txt`);
}

function loadToken(userId) {
  if (Object.prototype.hasOwnProperty.call(tokenCache, userId)) {
    return tokenCache[userId];
  }
  const file = tokenPath(userId);
  if (fs.existsSync(file)) {
    try {
      const data = fs.readFileSync(file, 'utf-8').trim();
      tokenCache[userId] = data || null;
    } catch (e) {
      tokenCache[userId] = null;
    }
  } else {
    tokenCache[userId] = null;
  }
  return tokenCache[userId];
}

function saveToken(userId, token) {
  ensureDir();
  const file = tokenPath(userId);
  try {
    if (token) {
      fs.writeFileSync(file, token, 'utf-8');
    } else if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  } catch (e) {
    console.error(`[tokenStore] failed to save token for ${userId}`, e.message);
  }
}

exports.setToken = (userId, token) => {
  tokenCache[userId] = token || null;
  saveToken(userId, token);
};

exports.getToken = userId => loadToken(userId);

exports.getAllUsers = () => {
  if (!fs.existsSync(tokensDir)) return [];
  return fs.readdirSync(tokensDir).map(f => path.basename(f, '.txt'));
};
