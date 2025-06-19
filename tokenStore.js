const fs = require('fs');
const path = require('path');

const cacheDir = path.join(__dirname, '.cache');
const tokenFile = path.join(cacheDir, 'token.txt');
let storedToken = null;

function ensureDir() {
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
}

function loadToken() {
  if (storedToken !== null) return storedToken;
  if (fs.existsSync(tokenFile)) {
    try {
      const data = fs.readFileSync(tokenFile, 'utf-8').trim();
      storedToken = data || null;
    } catch (e) {
      storedToken = null;
    }
  }
  return storedToken;
}

function saveToken(token) {
  ensureDir();
  try {
    if (token) {
      fs.writeFileSync(tokenFile, token, 'utf-8');
    } else if (fs.existsSync(tokenFile)) {
      fs.unlinkSync(tokenFile);
    }
  } catch (e) {
    console.error('[tokenStore] failed to save token', e.message);
  }
}

exports.setToken = (token) => {
  storedToken = token || null;
  saveToken(token);
};

exports.getToken = () => loadToken();
