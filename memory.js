
const fs = require('fs');
const path = require('path');
const github = require('./githubClient');
const tokenStore = require('./tokenStore');

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const contextFilename = path.join(__dirname, 'memory', 'context.md');

function ensureContext() {
  if (!fs.existsSync(contextFilename)) {
    ensureDir(contextFilename);
    fs.writeFileSync(contextFilename, '# Context\n', 'utf-8');
  }
}

function getToken(req) {
  if (req.body && req.body.token) return req.body.token;
  const auth = req.headers['authorization'];
  if (auth && auth.startsWith('token ')) return auth.slice(6);
  return tokenStore.getToken();
}

function prependMemoryPrefix(filename) {
  return filename.startsWith('memory/') ? filename : 'memory/' + filename;
}

exports.saveMemory = async (req, res) => {
  const { repo, filename, content } = req.body;
  const token = getToken(req);
  const finalFilename = prependMemoryPrefix(filename);
  console.log('[saveMemory]', new Date().toISOString(), repo, finalFilename);

  if (!filename || !content) {
    return res.status(400).json({ status: 'error', message: 'Missing required fields.' });
  }

  const filePath = path.join(__dirname, finalFilename);
  ensureDir(filePath);
  fs.writeFileSync(filePath, content, 'utf-8');

  if (repo && token) {
    try {
      await github.writeFile(token, repo, finalFilename, content, `update ${finalFilename}`);
    } catch (e) {
      console.error('GitHub write error', e.message);
    }
  }

  res.json({ status: 'success', action: 'saveMemory', filePath });
};

exports.readMemory = async (req, res) => {
  const { repo, filename } = req.body;
  const token = getToken(req);
  const finalFilename = prependMemoryPrefix(filename);
  console.log('[readMemory]', new Date().toISOString(), repo, finalFilename);

  const filePath = path.join(__dirname, finalFilename);
  if (repo && token) {
    try {
      const content = await github.readFile(token, repo, finalFilename);
      return res.json({ status: 'success', action: 'readMemory', content });
    } catch (e) {
      console.error('GitHub read error', e.message);
    }
  }

  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf-8');
    return res.json({ status: 'success', action: 'readMemory', content });
  }

  res.status(404).json({ status: 'error', message: 'Memory file not found.' });
};

exports.appendToMemory = (text) => {
  ensureContext();
  fs.appendFileSync(contextFilename, `\n${text}`, 'utf-8');
};

exports.readPersistentMemory = () => {
  ensureContext();
  return fs.readFileSync(contextFilename, 'utf-8');
};

exports.savePersistentMemory = (text) => {
  ensureContext();
  fs.writeFileSync(contextFilename, text, 'utf-8');
};

exports.generateFilename = (prefix = 'memory') => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join('memory', `${prefix}-${timestamp}.md`);
};

exports.timestampedFilename = (name = 'memory') => {
  const now = new Date().toISOString().replace(/[:.]/g, '-');
  return `memory/${name}-${now}.md`;
};
