const path = require('path');

function isLocalMode() {
  return (process.env.MEMORY_MODE || 'github').toLowerCase() === 'local';
}

function baseDir(userId = 'default') {
  if (isLocalMode()) {
    return path.join(__dirname, '..', 'local_memory', userId);
  }
  return path.join(__dirname, '..');
}

function resolvePath(relPath, userId = 'default') {
  return path.join(baseDir(userId), relPath);
}

module.exports = { isLocalMode, baseDir, resolvePath };
