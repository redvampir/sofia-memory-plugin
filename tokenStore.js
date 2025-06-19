const fs = require('fs');
const path = require('path');

const tokenFile = path.join(__dirname, 'token.json');
let storedToken = null;

function loadToken() {
  if (storedToken) return storedToken;
  if (fs.existsSync(tokenFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(tokenFile, 'utf-8'));
      storedToken = data.token || null;
    } catch (e) {
      storedToken = null;
    }
  }
  return storedToken;
}

function saveToken(token) {
  try {
    fs.writeFileSync(tokenFile, JSON.stringify({ token }), 'utf-8');
  } catch (e) {
    console.error('[tokenStore] failed to save token', e.message);
  }
}

exports.setToken = (token) => {
  storedToken = token;
  saveToken(token);
};

exports.getToken = () => loadToken();
