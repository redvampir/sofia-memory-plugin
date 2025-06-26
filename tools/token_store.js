// Хранилище токенов пользователей с простым шифрованием
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SECRET = process.env.TOKEN_SECRET || 'sofia_default_secret';
const KEY = crypto.createHash('sha256').update(String(SECRET)).digest();
const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

function encryptToken(token) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decryptToken(data) {
  try {
    const [ivHex, encHex] = data.split(':');
    if (!ivHex || !encHex) return null;
    const iv = Buffer.from(ivHex, 'hex');
    const encrypted = Buffer.from(encHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (e) {
    return null;
  }
}

const cacheDir = path.join(__dirname, '.cache');
const tokensDir = path.join(cacheDir, 'tokens');
const tokenCache = {};

function ensure_dir() {
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
      const decrypted = decryptToken(data);
      tokenCache[userId] = decrypted || data || null;
    } catch (e) {
      tokenCache[userId] = null;
    }
  } else {
    tokenCache[userId] = null;
  }
  return tokenCache[userId];
}

function saveToken(userId, token) {
  ensure_dir();
  const file = tokenPath(userId);
  try {
    if (token) {
      const encrypted = encryptToken(token);
      fs.writeFileSync(file, encrypted, 'utf-8');
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
