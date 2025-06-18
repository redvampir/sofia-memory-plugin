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
const indexFilename = path.join(__dirname, 'memory', 'index.json');

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
    updateIndexEntry(path.relative(__dirname, contextFilename));
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
    updateIndexEntry(path.relative(__dirname, planFilename));
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
  updateIndexEntry(path.relative(__dirname, planFilename));
}

loadPlan();

function getToken(req) {
  if (req.body && req.body.token) return req.body.token;
  const auth = req.headers['authorization'];
  if (auth && auth.startsWith('token ')) return auth.slice(6);
  return tokenStore.getToken();
}

function categorizeMemoryFile(name) {
  const lower = name.toLowerCase();
  if (lower === 'plan.json') return 'plan';
  if (lower.includes('lesson')) return 'lesson';
  if (lower.includes('note')) return 'notes';
  if (lower.includes('context')) return 'context';
  return 'memory';
}

function extractMeta(fullPath) {
  const stats = fs.statSync(fullPath);
  const result = { lastModified: stats.mtime.toISOString() };
  if (fullPath.endsWith('.md')) {
    try {
      const lines = fs.readFileSync(fullPath, 'utf-8').split(/\r?\n/);
      const titleLine = lines.find(l => l.trim());
      if (titleLine && titleLine.startsWith('#')) {
        result.title = titleLine.replace(/^#+\s*/, '');
      }
      if (lines.length > 1) {
        result.description = lines.slice(1, 3).join(' ').slice(0, 100);
      }
    } catch (e) {
      // ignore parsing errors
    }
  }
  return result;
}

function loadIndex() {
  if (fs.existsSync(indexFilename)) {
    try {
      return JSON.parse(fs.readFileSync(indexFilename, 'utf-8'));
    } catch (e) {
      return [];
    }
  }
  return [];
}

function saveIndex(data) {
  ensureDir(indexFilename);
  fs.writeFileSync(indexFilename, JSON.stringify(data, null, 2), 'utf-8');
}

function updateIndexEntry(relPath, repo, token) {
  const fullPath = path.join(__dirname, relPath);
  if (!fs.existsSync(fullPath)) return;
  const indexData = loadIndex();
  const meta = extractMeta(fullPath);
  const entry = {
    path: relPath,
    type: categorizeMemoryFile(path.basename(relPath)),
    ...meta
  };

  const existing = indexData.findIndex(e => e.path === relPath);
  if (existing >= 0) {
    indexData[existing] = { ...indexData[existing], ...entry };
  } else {
    indexData.push(entry);
  }

  saveIndex(indexData);

  if (repo && token) {
    try {
      github.writeFile(token, repo, path.relative(__dirname, indexFilename), JSON.stringify(indexData, null, 2), 'update index.json');
    } catch (e) {
      console.error('GitHub write index error', e.message);
    }
  }
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

  updateIndexEntry(normalizedFilename, repo, token);

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
  updateIndexEntry(path.relative(__dirname, planFilename));
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

  updateIndexEntry(path.relative(__dirname, contextFilename), repo, token);

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

  // Always use local storage for listing
  const fullPath = path.join(__dirname, directory);
  if (!fs.existsSync(fullPath)) return [];
  return fs
    .readdirSync(fullPath)
    .filter(name => name.endsWith('.md'));
};
