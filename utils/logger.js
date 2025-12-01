const fs = require('fs');
const { redact } = require('./logRedactor');

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

let currentLevel = (process.env.LOG_LEVEL || 'info').toLowerCase();
let stream = null;

function setLogFile(path) {
  if (path) {
    stream = fs.createWriteStream(path, { flags: 'a' });
  } else {
    if (stream) {
      stream.end();
    }
    stream = null;
  }
}

function timestamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function shouldLog(level) {
  const normalized = (level || '').toLowerCase();
  const current = levels[currentLevel] !== undefined ? levels[currentLevel] : levels.info;
  const requested = levels[normalized];
  if (requested === undefined) {
    return true;
  }
  return requested <= current;
}

function normalizeLevel(level) {
  const normalized = (level || 'INFO').toUpperCase();
  return ['ERROR', 'WARN', 'INFO', 'DEBUG'].includes(normalized) ? normalized : 'INFO';
}

function log(level, msg, data) {
  const normalizedLevel = normalizeLevel(level);
  if (!shouldLog(normalizedLevel)) return;

  const safeMessage = redact(msg);
  const safeData = data !== undefined ? redact(data) : undefined;
  const base = `[${timestamp()}] ${normalizedLevel} ${safeMessage}`;
  let serializedData = '';

  if (safeData !== undefined) {
    try {
      serializedData = typeof safeData === 'string' ? safeData : JSON.stringify(safeData);
    } catch (e) {
      serializedData = '[unserializable data]';
    }
  }

  const line = serializedData ? `${base} ${serializedData}` : base;
  if (stream) {
    stream.write(line + '\n');
  } else {
    if (normalizedLevel === 'ERROR') {
      console.error(line);
    } else if (normalizedLevel === 'WARN') {
      console.warn(line);
    } else {
      console.log(line);
    }
  }
}

module.exports = {
  setLogFile,
  setLogLevel: level => {
    currentLevel = (level || '').toLowerCase();
  },
  info: (msg, data) => log('INFO', msg, data),
  warn: (msg, data) => log('WARN', msg, data),
  debug: (msg, data) => log('DEBUG', msg, data),
  error: (msg, data) => log('ERROR', msg, data),
};
