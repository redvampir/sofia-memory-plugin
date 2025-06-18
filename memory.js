const fs = require('fs');
const path = require('path');
const github = require('./githubClient');
const tokenStore = require('./tokenStore');

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const contextFilename = path.join(__dirname, 'memory', 'context.md');
const planFilename = path.join(__dirname, 'memory', 'plan.json');

let planCache = null;

function detectLanguage() {
  const envLang = (process.env.LANG || '').toLowerCase();
  if (envLang.includes('ru')) return 'ru';
  if (envLang.includes('en')) return 'en';
  return 'en';
}

function ensureContext() {
  if (!fs.existsSync(contextFilename)) {
    ensureDir(contextFilename);
    fs.writeFileSync(contextFilename, '# Context\n', 'utf-8');
  }
}

function loadPlan() {
  ensureDir(planFilename);
  if (!fs.existsSync(planFilename)) {
    const newPlan = {
      start_date: new Date().toISOString().split('T')[0],
      language: detectLanguage(),
      lessons_completed: [],
      project_files: [],
      planned_lessons: [],
      requires_context: true
    };
    fs.writeFileSync(planFilename, JSON.stringify(newPlan, null, 2), 'utf-8');
    planCache = newPlan;
  } else {
    try {
      const content = fs.readFileSync(planFilename, 'utf-8');
      planCache = JSON.parse(content);
    } catch (e) {
      planCache = {};
    }
  }
}

function savePlan() {
  if (!planCache) loadPlan();
  fs.writeFileSync(planFilename, JSON.stringify(planCache, null, 2), 'utf-8');
}

loadPlan();

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

  const normalizedFilename = filename.startsWith('memory/')
    ? filename
    : `memory/${filename}`;
  const filePath = path.join(__dirname, normalizedFilename);
  ensureDir(filePath);
  fs.writeFileSync(filePath, content, 'utf-8');

  if (repo && token) {
    try {
      await github.writeFile(token, repo, normalizedFilename, content, `update ${filename}`);
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

  const normalizedFilename = filename.startsWith('memory/')
    ? filename
    : `memory/${filename}`;
  const filePath = path.join(__dirname, normalizedFilename);
  if (repo && token) {
    try {
      const content = await github.readFile(token, repo, normalizedFilename);
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
  const { title, summary, projectFiles, plannedLessons } = req.body;
  console.log('[saveLessonPlan]', new Date().toISOString(), title);

  if (!planCache) loadPlan();

  if (title || summary) {
    planCache.lessons_completed.push({
      title: title || `lesson_${planCache.lessons_completed.length + 1}`,
      date: new Date().toISOString().split('T')[0],
      summary: summary || ''
    });
  }

  if (Array.isArray(projectFiles)) {
    planCache.project_files = projectFiles;
  }

  if (Array.isArray(plannedLessons)) {
    planCache.planned_lessons = plannedLessons;
  }

  savePlan();
  res.json({ status: 'success', action: 'saveLessonPlan', plan: planCache });
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

exports.readPlan = (req, res) => {
  if (!planCache) loadPlan();
  res.json({ status: 'success', plan: planCache });
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

// List markdown files in a directory either from GitHub or local storage
exports.listMemoryFiles = async function(repo, token, dirPath) {
  const directory = dirPath.startsWith('memory/') ? dirPath : dirPath;

  // If repo and token provided, attempt to read from GitHub
  if (repo && token) {
    try {
      const items = await github.listFilesInDirectory(repo, token, directory);
      return items
        .filter(item => item.type === 'file' && item.name.endsWith('.md'))
        .map(item => item.name);
    } catch (e) {
      console.error('GitHub list files error', e.message);
      throw e;
    }
  }

  // Local fallback
  const fullPath = path.join(__dirname, directory);
  if (!fs.existsSync(fullPath)) return [];
  return fs
    .readdirSync(fullPath)
    .filter(name => name.endsWith('.md'));
};
