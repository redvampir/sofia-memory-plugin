/**
 * Secure token storage with AES-256-CBC encryption
 */
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const SECRET = process.env.TOKEN_SECRET;

if (!SECRET) {
  console.error(
    '[tokenStore] TOKEN_SECRET environment variable is not set: cannot encrypt tokens'
  );
  throw new Error('TOKEN_SECRET is required to start tokenStore');
}

const KEY = crypto.createHash('sha256').update(String(SECRET)).digest();
const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

/**
 * Encrypt token using AES-256-CBC
 * @param {string} token - Plain text token
 * @returns {string} Encrypted token in format "iv:encrypted"
 */
function encryptToken(token) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

/**
 * Decrypt token using AES-256-CBC
 * @param {string} data - Encrypted token in format "iv:encrypted"
 * @returns {string|null} Decrypted token or null if decryption fails
 */
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
    console.error('[tokenStore] decryption failed:', e.message);
    return null;
  }
}

const cacheDir = path.join(__dirname, '.cache');
const tokensDir = path.join(cacheDir, 'tokens');
const tokenCache = {};

/**
 * Ensure tokens directory exists
 */
async function ensureDir() {
  try {
    await fsp.mkdir(tokensDir, { recursive: true });
  } catch {
    // Directory already exists
  }
}

/**
 * Get file path for user's token
 * @param {string} userId
 * @returns {string}
 */
function tokenPath(userId) {
  return path.join(tokensDir, `${userId}.txt`);
}

/**
 * Load and decrypt token from cache or disk
 * @param {string} userId
 * @returns {Promise<string|null>}
 */
async function loadToken(userId) {
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
}

/**
 * Encrypt and save token to disk
 * @param {string} userId
 * @param {string|null} token
 */
async function saveToken(userId, token) {
  await ensureDir();
  const file = tokenPath(userId);

  try {
    if (token) {
      const encrypted = encryptToken(token);
      await fsp.writeFile(file, encrypted, 'utf-8');
    } else {
      await fsp.unlink(file).catch(() => {});
    }
  } catch (e) {
    console.error(`[tokenStore] failed to save token for ${userId}`, e.message);
  }
}

/**
 * Set token for a user
 * @param {string} userId
 * @param {string|null} token - GitHub token or null to remove
 */
exports.setToken = async (userId, token) => {
  tokenCache[userId] = token || null;
  await saveToken(userId, token);
};

/**
 * Get token for a user
 * @param {string} userId
 * @returns {Promise<string|null>}
 */
exports.getToken = userId => loadToken(userId);

/**
 * Get all user IDs with stored tokens
 * @returns {Promise<string[]>}
 */
exports.getAllUsers = async () => {
  try {
    await fsp.access(tokensDir);
  } catch {
    return [];
  }

  const files = await fsp.readdir(tokensDir);
  return files.map(f => path.basename(f, '.txt'));
};

/**
 * Clear token cache (for testing)
 */
exports.clearCache = () => {
  Object.keys(tokenCache).forEach(key => delete tokenCache[key]);
};
