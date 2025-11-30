// Хранилище токенов пользователей с простым шифрованием
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { Mutex } = require('async-mutex');

const SECRET = process.env.TOKEN_SECRET;

if (!SECRET) {
  console.error(
    '[tokenStore] переменная окружения TOKEN_SECRET не задана: невозможно шифровать токены'
  );
  throw new Error('TOKEN_SECRET is required to start tokenStore');
}
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
const storeMutex = new Mutex();

async function ensure_dir() {
  try {
    await fsp.mkdir(tokensDir, { recursive: true });
  } catch {}
}

function tokenPath(userId) {
  return path.join(tokensDir, `${userId}.txt`);
}

async function loadToken(userId) {
  if (Object.prototype.hasOwnProperty.call(tokenCache, userId)) {
    return tokenCache[userId];
  }
  return storeMutex.runExclusive(async () => {
    if (Object.prototype.hasOwnProperty.call(tokenCache, userId)) {
      return tokenCache[userId];
    }
    const file = tokenPath(userId);
    try {
      const data = await fsp.readFile(file, 'utf-8');
      const decrypted = decryptToken(data.trim());
      tokenCache[userId] = decrypted || data.trim() || null;
    } catch {
      tokenCache[userId] = null;
    }
    return tokenCache[userId];
  });
}

async function saveToken(userId, token) {
  await ensure_dir();
  const file = tokenPath(userId);
  try {
    await storeMutex.runExclusive(async () => {
      if (token) {
        const encrypted = encryptToken(token);
        await fsp.writeFile(file, encrypted, 'utf-8');
      } else {
        await fsp.unlink(file).catch(() => {});
      }
    });
  } catch (e) {
    console.error(`[tokenStore] failed to save token for ${userId}`, e.message);
  }
}

exports.setToken = async (userId, token) => {
  tokenCache[userId] = token || null;
  await saveToken(userId, token);
};

exports.getToken = userId => loadToken(userId);

exports.getAllUsers = async () => {
  try {
    await fsp.access(tokensDir);
  } catch {
    return [];
  }
  const files = await fsp.readdir(tokensDir);
  return files.map(f => path.basename(f, '.txt'));
};
