const fs = require('fs');
const { redactSecrets, redactObject } = require('./log_redactor');

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

function log(level, msg, data) {
  // Redact secrets в сообщении и данных
  const safeMsg = redactSecrets(msg);
  let safeData = data;

  if (data !== undefined) {
    if (typeof data === 'string') {
      safeData = redactSecrets(data);
    } else if (typeof data === 'object') {
      safeData = redactObject(data);
    }
  }

  const base = `[${timestamp()}] ${level} ${safeMsg}`;
  const line = safeData !== undefined
    ? `${base} ${typeof safeData === 'string' ? safeData : JSON.stringify(safeData)}`
    : base;

  if (stream) {
    stream.write(line + '\n');
  } else {
    if (level === 'ERROR') {
      console.error(line);
    } else {
      console.log(line);
    }
  }
}

module.exports = {
  setLogFile,
  info: (msg, data) => log('INFO', msg, data),
  debug: (msg, data) => log('DEBUG', msg, data),
  error: (msg, data) => log('ERROR', msg, data),
};
