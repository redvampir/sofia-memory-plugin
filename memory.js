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

exports.saveMemory = async (req, res) => {
  const { repo, filename, content } = req.body;
  const token = getToken(req);
  console.log('[saveMemory]', new Date().toISOString(), repo, filename);

  if (!filename || !content) {
    return res.status(400).json({ status: 'error', message: 'Missing required fields.' });
  }

  const filePath = path.join(__dirname, 'memory', filename);
  ensureDir(filePath);
  fs.writeFileSync(filePath, content, 'utf-8');

  if (repo && token) {
    try {
      await github.writeFile(token, repo, path.posix.join('memory', filename), content, `update ${filename}`);
    } catch (e) {
      console.error('GitHub write error', e.message);
    }
  }

  res.json({ status: 'success', action: 'saveMemory', filePath });
};

exports.readMemory = async (req, res) => {
  const { repo, filename } = req.body;
  const token = getToken(req);
  console.log('[readMemory]', new Date().toISOString(), repo, filename);

  const filePath = path.join(__dirname, 'memory', filename);
  if (repo && token) {
    try {
      const content = await github.readFile(token, repo, path.posix.join('memory', filename));
      return res.json({ status: 'success', action: 'readMemory', content });
    } catch (e) {
      console.error('GitHub read error', e.message);
    }
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ status: 'error', message: 'File not found.' });
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  res.json({ status: 'success', action: 'readMemory', content });
};

exports.setMemoryRepo = (req, res) => {
  const { repoUrl } = req.body;
  console.log('[setMemoryRepo]', repoUrl);
  res.json({ status: 'success', repo: repoUrl });
};

exports.saveLessonPlan = (req, res) => {
  const { planData } = req.body;
  console.log('[saveLessonPlan]', new Date().toISOString());
  res.json({ status: 'success', action: 'saveLessonPlan' });
};

exports.saveNote = (req, res) => {
  const { note } = req.body;
  console.log('[saveNote]', new Date().toISOString());
  res.json({ status: 'success', action: 'saveNote' });
};

exports.getContextSnapshot = (req, res) => {
  console.log('[getContextSnapshot]', new Date().toISOString());
  res.json({ status: 'success', context: {} });
};

exports.createUserProfile = (req, res) => {
  const { user } = req.body;
  console.log('[createUserProfile]', user);
  res.json({ status: 'success', action: 'createUserProfile' });
};

exports.setToken = (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ status: 'error', message: 'Token required' });
  }
  tokenStore.setToken(token);
  res.json({ status: 'success', action: 'setToken' });
};

exports.saveContext = async (req, res) => {
  const { repo, content } = req.body;
  const token = getToken(req);
  console.log('[saveContext]', new Date().toISOString(), repo);

  ensureContext();
  const data = content || '';
  fs.writeFileSync(contextFilename, data, 'utf-8');

  if (repo && token) {
    try {
      await github.writeFile(token, repo, 'memory/context.md', data, 'update context');
    } catch (e) {
      console.error('GitHub write context error', e.message);
    }
  }

  res.json({ status: 'success', action: 'saveContext' });
};

exports.readContext = async (req, res) => {
  const { repo } = req.body;
  const token = getToken(req);
  console.log('[readContext]', new Date().toISOString(), repo);

  ensureContext();

  if (repo && token) {
    try {
      const content = await github.readFile(token, repo, 'memory/context.md');
      return res.json({ status: 'success', content });
    } catch (e) {
      console.error('GitHub read context error', e.message);
    }
  }

  const content = fs.readFileSync(contextFilename, 'utf-8');
  res.json({ status: 'success', content });
};

