const fs = require('fs');
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
  const base = `[${timestamp()}] ${level} ${msg}`;
  const line = data !== undefined ? `${base} ${typeof data === 'string' ? data : JSON.stringify(data)}` : base;
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
