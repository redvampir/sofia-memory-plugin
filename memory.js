const fs = require('fs');
const path = require('path');
const github = require('./githubClient');
const tokenStore = require('./tokenStore');
const memoryConfig = require('./memoryConfig');
const indexManager = require('./indexManager');

const DEBUG = process.env.DEBUG === 'true';

function logDebug(...args) {
  if (DEBUG) console.log(...args);
}

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function writeFileSafe(filePath, data) {
  try {
    ensureDir(filePath);
    fs.writeFileSync(filePath, data, 'utf-8');
    console.log('[writeFileSafe] wrote', filePath);
  } catch (e) {
    console.error(`[writeFileSafe] Error writing ${filePath}`, e.message);
    throw e;
  }
}

function normalizeMemoryPath(p) {
  if (!p) return 'memory/';
  // support Windows-style separators and remove leading prefixes
  let rel = p.replace(/\\+/g, '/');
  rel = path.posix
    .normalize(rel)
    .replace(/^(\.\/)+/, '')
    .replace(/^\/+/, '');
  while (rel.startsWith('memory/')) {
    rel = rel.slice('memory/'.length);
  }
  return path.posix.join('memory', rel);
}

async function githubWriteFileSafe(token, repo, relPath, data, message, attempts = 2) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await github.writeFile(token, repo, relPath, data, message);
      console.log('[githubWriteFileSafe] pushed', relPath);
      return;
    } catch (e) {
      console.error(`[githubWriteFileSafe] attempt ${i} failed for ${relPath}`, e.message);
      if (i === attempts) throw e;
    }
  }
}

function isObject(val) {
  return val && typeof val === 'object' && !Array.isArray(val);
}

function deepMerge(target, source, matchKey) {
  if (Array.isArray(target) && Array.isArray(source)) {
    const result = [...target];
    const srcArr = source;
    srcArr.forEach(item => {
      if (matchKey && isObject(item)) {
        const idx = result.findIndex(e => isObject(e) && e[matchKey] === item[matchKey]);
        if (idx >= 0) {
          result[idx] = deepMerge(result[idx], item, matchKey);
        } else {
          result.push(item);
        }
      } else if (!result.includes(item)) {
        result.push(item);
      }
    });
    return result;
  } else if (isObject(target) && isObject(source)) {
    const out = { ...target };
    Object.keys(source).forEach(key => {
      if (key in target) {
        out[key] = deepMerge(target[key], source[key], matchKey);
      } else {
        out[key] = source[key];
      }
    });
    return out;
  }
  return source;
}

async function updateOrInsertJsonEntry(filePath, newData, matchKey, repo, token) {
  ensureDir(filePath);
  const relPath = path.relative(__dirname, filePath);
  let existing = Array.isArray(newData) ? [] : {};

  if (repo && token) {
    try {
      const remote = await github.readFile(token, repo, relPath);
      existing = JSON.parse(remote);
    } catch (e) {
      // ignore missing remote file
    }
  }

  if (fs.existsSync(filePath)) {
    try {
      const local = fs.readFileSync(filePath, 'utf-8');
      existing = deepMerge(existing, JSON.parse(local), matchKey);
    } catch (e) {
      // ignore parse errors
    }
  }

  const updated = deepMerge(existing, newData, matchKey);
  writeFileSafe(filePath, JSON.stringify(updated, null, 2));

  if (repo && token) {
    try {
      await githubWriteFileSafe(
        token,
        repo,
        relPath,
        JSON.stringify(updated, null, 2),
        `update ${path.basename(filePath)}`
      );
    } catch (e) {
      console.error('GitHub write error', e.message);
    }
  }

  return updated;
}

async function fileExistsInRepo(repo, token, relPath) {
  if (!repo || !token) return true;
  try {
    await github.readFile(token, repo, relPath);
    return true;
  } catch (e) {
    if (e.response?.status === 404) return false;
    console.error('[fileExistsInRepo] GitHub check failed', e.message);
    return true;
  }
}

function deduplicateEntries(entries) {
  const map = new Map();
  const result = [];
  entries.forEach(e => {
    const base = path
      .basename(e.path)
      .toLowerCase()
      .replace(/\.[^.]+$/, '');
    const key = (e.title || '').toLowerCase() || base.replace(/[-_].*/, '');
    if (map.has(key)) {
      console.warn(
        `[deduplicateEntries] duplicate ${e.path} ignored; matches ${map.get(key).path}`
      );
    } else {
      map.set(key, e);
      result.push(e);
    }
  });
  return result;
}

const contextFilename = path.join(__dirname, 'memory', 'context.md');
const planFilename = path.join(__dirname, 'memory', 'plan.md');
const indexFilename = path.join(__dirname, 'memory', 'index.json');

let planCache = null;

function parsePlanMarkdown(md) {
  const plan = { completedLessons: [], requestedClarifications: [], nextLesson: '' };
  const lines = md.split(/\r?\n/);
  let section = '';
  for (const line of lines) {
    if (/^##\s+Completed Lessons/i.test(line)) { section = 'completed'; continue; }
    if (/^##\s+Requested Clarifications/i.test(line)) { section = 'clar'; continue; }
    if (/^##\s+Progress/i.test(line)) { section = 'progress'; continue; }
    if (/^-\s+/.test(line) && section === 'completed') {
      plan.completedLessons.push(line.replace(/^-\s+/, '').trim());
    } else if (/^-\s+/.test(line) && section === 'clar') {
      plan.requestedClarifications.push(line.replace(/^-\s+/, '').trim());
    } else if (section === 'progress') {
      const m = line.match(/Next lesson:\s*(.*)/i);
      if (m) plan.nextLesson = m[1].trim();
    }
  }
  return plan;
}

function planToMarkdown(plan) {
  const completed = (plan.completedLessons || [])
    .map(t => `- ${t}`)
    .join('\n');
  const clar = (plan.requestedClarifications || [])
    .map(t => `- ${t}`)
    .join('\n');
  const total = plan.totalLessons || (plan.completedLessons || []).length;
  return (
    `# Learning Plan\n\n` +
    `## Completed Topics\n${completed}\n\n` +
    `## Clarified or Expanded Topics\n${clar}\n\n` +
    `## Progress: ${plan.completedLessons.length} / ${total} lessons complete` +
    (plan.nextLesson ? `\nNext lesson: ${plan.nextLesson}` : '') +
    `\n`
  );
}

function updatePlanFromIndex(plan) {
  if (!fs.existsSync(indexFilename)) return plan;
  let data = [];
  try {
    data = JSON.parse(fs.readFileSync(indexFilename, 'utf-8'));
  } catch (e) {
    data = [];
  }
  const lessons = data.filter(e => e.type === 'lesson');
  lessons.sort((a, b) => {
    if (a.lastModified && b.lastModified) {
      return new Date(a.lastModified) - new Date(b.lastModified);
    }
    return (a.path || '').localeCompare(b.path || '');
  });
  lessons.forEach(l => {
    const title = l.title || path.basename(l.path || '');
    if (!plan.completedLessons.includes(title)) plan.completedLessons.push(title);
  });
  plan.totalLessons = lessons.length;
  return plan;
}

function detectLanguage() {
  const envLang = (process.env.LANG || '').toLowerCase();
  if (envLang.includes('ru')) return 'ru';
  if (envLang.includes('en')) return 'en';
  return 'en';
}

function ensureContext() {
  if (!fs.existsSync(contextFilename)) {
    ensureDir(contextFilename);
    writeFileSafe(contextFilename, '# Context\n');
    rebuildIndex().catch(e => console.error('[ensureContext] rebuild error', e.message));
  }
}

function loadPlan() {
  ensureDir(planFilename);
  const existed = fs.existsSync(planFilename);
  let plan;
  if (existed) {
    try {
      const content = fs.readFileSync(planFilename, 'utf-8');
      plan = parsePlanMarkdown(content);
    } catch (e) {
      plan = { completedLessons: [], requestedClarifications: [], nextLesson: '' };
    }
  } else {
    plan = { completedLessons: [], requestedClarifications: [], nextLesson: '' };
  }

  plan = updatePlanFromIndex(plan);
  writeFileSafe(planFilename, planToMarkdown(plan));
  planCache = plan;
  if (!existed) {
    rebuildIndex().catch(e => console.error('[loadPlan] rebuild error', e.message));
  }
}

async function savePlan(repo, token) {
  if (!planCache) loadPlan();
  const md = planToMarkdown(planCache);
  writeFileSafe(planFilename, md);
  if (repo && token) {
    try {
      await githubWriteFileSafe(token, repo, path.relative(__dirname, planFilename), md, 'update plan');
    } catch (e) {
      console.error('GitHub write plan error', e.message);
    }
  }
  await rebuildIndex(repo, token);
}

(async () => {
  try {
    await loadPlan();
    await rebuildIndex();
  } catch (e) {
    console.error('[init] startup error', e.message);
  }
})();

function getToken(req) {
  if (req.body && req.body.token) return req.body.token;
  const auth = req.headers['authorization'];
  if (auth && auth.startsWith('token ')) return auth.slice(6);
  const stored = tokenStore.getToken();
  if (stored) return stored;
  return null;
}

function categorizeMemoryFile(name) {
  const lower = name.toLowerCase();
  const ext = path.extname(lower);

  if (lower === 'plan.md' || lower.endsWith('plan.md')) return 'plan';
  if (lower.includes('lesson')) return 'lesson';
  if (lower.includes('note')) return 'note';
  if (lower.includes('context')) return 'context';
  if (lower.includes('practice')) return 'practice';

  if (['.md', '.txt', '.json'].includes(ext)) return 'lesson';
  if (['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.html', '.css', '.c', '.cpp'].includes(ext))
    return 'project';
  if (['.png', '.jpg', '.jpeg', '.svg', '.gif'].includes(ext)) return 'project';
  
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
  if (!fs.existsSync(indexFilename)) {
    console.warn('[loadIndex] index.json not found - creating new');
    ensureDir(indexFilename);
    writeFileSafe(indexFilename, '[]');
    return [];
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(indexFilename, 'utf-8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('[loadIndex] failed to parse index.json, resetting', e.message);
    writeFileSafe(indexFilename, '[]');
    return [];
  }
}

function saveIndex(data) {
  ensureDir(indexFilename);
  writeFileSafe(indexFilename, JSON.stringify(data, null, 2));
}

async function updateIndexFile(entry, repo, token) {
  const data = await fetchIndex(repo, token);
  const idx = data.findIndex(i => i.path === entry.path);
  if (idx >= 0) {
    data[idx] = { ...data[idx], ...entry };
    console.log('[updateIndexFile] updated', entry.path);
  } else {
    data.push(entry);
    console.log('[updateIndexFile] added', entry.path);
  }
  const clean = deduplicateEntries(data);
  await persistIndex(clean, repo, token);
  return clean;
}

async function updateIndexFromPath(relPath, repo, token) {
  const fullPath = path.join(__dirname, relPath);
  if (!fs.existsSync(fullPath)) return;
  const meta = extractMeta(fullPath);
  const entry = {
    path: relPath,
    type: categorizeMemoryFile(path.basename(relPath)),
    ...meta
  };

  await updateIndexFile(entry, repo, token);
}

async function scanMemoryFolderRecursively(repo, token, basePath = 'memory') {
  const files = [];

  function walk(current) {
    const items = fs.readdirSync(current, { withFileTypes: true });
    items.forEach(item => {
      const abs = path.join(current, item.name);
      if (item.isDirectory()) {
        walk(abs);
      } else if (item.isFile()) {
        const rel = path.relative(__dirname, abs).replace(/\\/g, '/');
        if (rel.endsWith('index.json')) {
          logDebug('[scan] skipped', rel, 'index file');
          return;
        }
        if (/\.(md|txt|json|js|ts|jsx|tsx|html|css|png|jpe?g|svg|gif|py|java|c|cpp|csv)$/i.test(item.name)) {
          files.push(rel);
          logDebug('[scan] file', rel);
        } else {
          logDebug('[scan] skipped', rel, 'unsupported extension');
        }
      }
    });
  }

  const rootPath = path.join(__dirname, basePath);
  if (fs.existsSync(rootPath)) walk(rootPath);

  const verified = [];
  for (const rel of files) {
    // eslint-disable-next-line no-await-in-loop
    if (await fileExistsInRepo(repo, token, rel)) {
      verified.push(rel);
    } else {
      console.warn(`[scanMemoryFolderRecursively] ${rel} not found in repo`);
    }
  }
  return verified;
}

async function fetchIndex(repo, token) {
  const indexRel = path.relative(__dirname, indexFilename);
  let localData = [];
  let remoteData = [];

  if (fs.existsSync(indexFilename)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(indexFilename, 'utf-8'));
      if (Array.isArray(parsed)) localData = parsed;
    } catch (e) {
      console.warn('[fetchIndex] local read error', e.message);
    }
  }

  if (repo && token) {
    try {
      const remote = await github.readFile(token, repo, indexRel);
      const parsedRemote = JSON.parse(remote);
      if (Array.isArray(parsedRemote)) remoteData = parsedRemote;
    } catch (e) {
      if (e.response?.status !== 404) {
        console.error('[fetchIndex] GitHub read error', e.message);
      }
    }
  }

  const map = new Map();
  [...localData, ...remoteData].forEach(entry => {
    if (entry && entry.path) {
      map.set(entry.path, { ...map.get(entry.path), ...entry });
    }
  });

  return Array.from(map.values());
}

async function persistIndex(data, repo, token) {
  ensureDir(indexFilename);
  try {
    writeFileSafe(indexFilename, JSON.stringify(data, null, 2));
    console.log('[persistIndex] local index saved');
  } catch (e) {
    console.error('[persistIndex] local write error', e.message);
  }

  const finalRepo = repo || memoryConfig.getRepoUrl();
  const finalToken = token || tokenStore.getToken();

  if (finalRepo && finalToken) {
    try {
      await githubWriteFileSafe(
        finalToken,
        finalRepo,
        path.relative(__dirname, indexFilename),
        JSON.stringify(data, null, 2),
        'update index.json'
      );
      console.log('[persistIndex] pushed index to GitHub');
    } catch (e) {
      console.error('[persistIndex] GitHub write error', e.message);
    }
  }
}

async function updateIndexEntry(repo, token, { path: filePath, type, title, description, lastModified }) {
  if (!filePath) return null;

  const normalized = normalizeMemoryPath(filePath);
  const indexData = await fetchIndex(repo, token);
  const idx = indexData.findIndex(e => path.posix.normalize(e.path) === normalized);

  const entry = {
    path: normalized,
    type: type || categorizeMemoryFile(path.basename(normalized)),
  };
  if (title !== undefined) entry.title = title;
  if (description !== undefined) entry.description = description;
  entry.lastModified = lastModified || new Date().toISOString();

  let op = 'skipped';
  if (idx >= 0) {
    const existing = indexData[idx];
    const metaChanged =
      existing.type !== entry.type ||
      existing.title !== entry.title ||
      existing.description !== entry.description;
    const timeChanged = existing.lastModified !== entry.lastModified;

    // always update stored timestamp
    indexData[idx] = { ...existing, ...entry };

    if (metaChanged || timeChanged) {
      op = metaChanged ? 'updated' : 'timestamp';
    }
  } else {
    indexData.push(entry);
    op = 'added';
  }

  const dedupMap = new Map();
  indexData.forEach(e => {
    const p = path.posix.normalize(e.path);
    dedupMap.set(p, { ...dedupMap.get(p), ...e });
  });
  let deduped = Array.from(dedupMap.values());
  deduped = deduplicateEntries(deduped);
  indexData.length = 0;
  indexData.push(...deduped);

  await persistIndex(indexData, repo, token);
  if (op === 'skipped') {
    logDebug('[updateIndexEntry] skipped', normalized, 'no changes detected');
  } else {
    console.log('[updateIndexEntry]', op, normalized);
  }
  return entry;
}

function scanMemoryDir(dirPath) {
  const results = [];

  function walk(current) {
    const items = fs.readdirSync(current);
    items.forEach(item => {
      const abs = path.join(current, item);
      const stats = fs.statSync(abs);
      if (stats.isDirectory()) {
        walk(abs);
      } else {
        if (abs === indexFilename) return;
        const rel = path.relative(__dirname, abs);
        const meta = extractMeta(abs);
        results.push({
          path: rel,
          type: categorizeMemoryFile(item),
          ...meta
        });
      }
    });
  }

  if (fs.existsSync(dirPath)) walk(dirPath);
  return results;
}

async function rebuildIndex(repo, token) {
  const paths = await scanMemoryFolderRecursively(repo, token);
  const entries = [];
  for (const rel of paths) {
    const abs = path.join(__dirname, rel);
    const meta = extractMeta(abs);
    entries.push({
      path: rel,
      type: categorizeMemoryFile(path.basename(rel)),
      title: meta.title,
      description: meta.description,
      lastModified: meta.lastModified
    });
  }

  const clean = deduplicateEntries(entries);
  await persistIndex(clean, repo, token);
  return clean;
}

async function updateIndexFileManually(newEntries, repo, token) {
  if (!Array.isArray(newEntries)) return [];
  const results = [];
  for (const entry of newEntries) {
    if (!entry.path) continue;
    try {
      const updated = await updateIndexEntry(repo, token, entry);
      if (updated) results.push(updated);
    } catch (e) {
      console.error('[updateIndexFileManually]', e.message);
    }
  }
  return results;
}

async function saveMemory(req, res) {
  console.log('[saveMemory] called');
  const { repo, filename, content } = req.body;
  const token = getToken(req);
  const effectiveRepo = repo || memoryConfig.getRepoUrl();
  console.log('[saveMemory]', new Date().toISOString(), effectiveRepo, filename);

  if (!filename || content === undefined) {
    return res.status(400).json({ status: 'error', message: 'Missing required fields.' });
  }

  const normalizedFilename = normalizeMemoryPath(filename);
  const filePath = path.join(__dirname, normalizedFilename);
  ensureDir(filePath);

  let writeErr = null;
  let gitErr = null;

  if (filename.trim().endsWith('.json')) {
    try {
      const data = JSON.parse(content);
      await updateOrInsertJsonEntry(filePath, data, null, effectiveRepo, token);
    } catch (e) {
      console.error('[saveMemory] invalid JSON', e.message);
      return res.status(400).json({ status: 'error', message: 'Invalid JSON' });
    }
  } else {
    try {
      writeFileSafe(filePath, content);
      console.log('[saveMemory] wrote', normalizedFilename);
    } catch (e) {
      console.error('[saveMemory] local write failed', e.message);
      writeErr = e;
    }

    if (effectiveRepo) {
      if (!token) {
        return res.status(401).json({
          status: 'error',
          message: 'Missing GitHub token'
        });
      } else {
        try {
          await githubWriteFileSafe(
            token,
            effectiveRepo,
            normalizedFilename,
            content,
            `update ${filename}`
          );
          console.log('[saveMemory] pushed to GitHub', normalizedFilename);
        } catch (e) {
          gitErr = e;
          console.error('GitHub write error', e.message);
        }
      }
    }
  }

  if (writeErr || gitErr) {
    return res.status(500).json({
      status: 'error',
      message: 'Failed to save file',
      error: (gitErr || writeErr).message
    });
  }

  const meta = extractMeta(filePath);
  try {
    await updateIndexEntry(effectiveRepo, token, {
      path: normalizedFilename,
      type: categorizeMemoryFile(path.basename(normalizedFilename)),
      title: meta.title,
      description: meta.description,
      lastModified: new Date().toISOString(),
    });
    logDebug('[saveMemory] index updated', normalizedFilename);
    if (!planCache) loadPlan();
    planCache = updatePlanFromIndex(planCache);
    await savePlan(effectiveRepo, token);
  } catch (e) {
    console.error('[saveMemory] index update error', e.message);
  }

  res.json({ status: 'success', action: 'saveMemory', filePath: normalizedFilename });
}

async function readMemory(req, res) {
  const { repo, filename } = req.body;
  const token = getToken(req);
  const effectiveRepo = repo || memoryConfig.getRepoUrl();
  console.log('[readMemory]', new Date().toISOString(), effectiveRepo, filename);

  const normalizedFilename = normalizeMemoryPath(filename);
  const filePath = path.join(__dirname, normalizedFilename);
  if (effectiveRepo) {
    if (!token) {
      return res.status(401).json({ status: 'error', message: 'Missing GitHub token' });
    }
    try {
      const content = await github.readFile(token, effectiveRepo, normalizedFilename);
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
}

function setMemoryRepo(req, res) {
  const { repoUrl } = req.body;
  console.log('[setMemoryRepo]', repoUrl);
  memoryConfig.setRepoUrl(repoUrl);
  res.json({ status: 'success', repo: repoUrl });
}

async function saveLessonPlan(req, res) {
  const { title, summary, projectFiles, plannedLessons, repo } = req.body;
  const token = getToken(req);
  console.log('[saveLessonPlan]', new Date().toISOString(), title);
  const effectiveRepo = repo || memoryConfig.getRepoUrl();

  if (!planCache) loadPlan();
  if (title) {
    if (!planCache.completedLessons.includes(title)) {
      planCache.completedLessons.push(title);
    }
  }
  if (Array.isArray(plannedLessons) && plannedLessons.length > 0) {
    planCache.nextLesson = plannedLessons[0];
  }

  planCache = updatePlanFromIndex(planCache);
  await savePlan(effectiveRepo, token);
  res.json({ status: 'success', action: 'saveLessonPlan', plan: planCache });
}

function saveNote(req, res) {
  const { note } = req.body;
  console.log('[saveNote]', new Date().toISOString());
  res.json({ status: 'success', action: 'saveNote' });
}

function getContextSnapshot(req, res) {
  console.log('[getContextSnapshot]', new Date().toISOString());
  res.json({ status: 'success', context: {} });
}

function createUserProfile(req, res) {
  const { user } = req.body;
  console.log('[createUserProfile]', user);
  res.json({ status: 'success', action: 'createUserProfile' });
}

function setToken(req, res) {
  const token = req.body && req.body.token ? req.body.token : '';
  if (token) {
    console.log('[setToken] token updated');
  } else {
    console.log('[setToken] token cleared or missing');
  }
  tokenStore.setToken(token);
  res.json({ status: 'success', action: 'setToken', connected: !!token });
}

function tokenStatus(req, res) {
  const token = tokenStore.getToken();
  console.log('[tokenStatus]', !!token);
  res.json({ connected: !!token });
}

function readPlan(req, res) {
  try {
    loadPlan();
  } catch (e) {
    console.error('[readPlan] failed to load plan', e.message);
  }
  res.json({ status: 'success', plan: planCache });
}

async function saveContext(req, res) {
  const { repo, content } = req.body;
  const token = getToken(req);
  console.log('[saveContext]', new Date().toISOString(), repo);

  ensureContext();
  const data = content || '';
  writeFileSafe(contextFilename, data);

  if (repo && token) {
    try {
      await githubWriteFileSafe(token, repo, 'memory/context.md', data, 'update context');
    } catch (e) {
      console.error('GitHub write context error', e.message);
    }
  }

  try {
    await rebuildIndex(repo, token);
  } catch (e) {
    console.error('[saveContext] rebuild error', e.message);
  }

  res.json({ status: 'success', action: 'saveContext' });
}

async function readContext(req, res) {
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
}

// Recursively list memory files from local storage
async function listMemoryFiles(repo, token, dirPath) {
  const directory = dirPath.startsWith('memory') ? dirPath : path.join('memory', dirPath);
  const fullPath = path.join(__dirname, directory);
  if (!fs.existsSync(fullPath)) return [];

  const results = [];
  function walk(current) {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    entries.forEach(entry => {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
      } else if (entry.isFile()) {
        const rel = path.relative(__dirname, abs).replace(/\\/g, '/');
        if (rel.endsWith('index.json')) return;
        if (/\.(md|txt|json|js|ts|jsx|tsx|html|css)$/i.test(entry.name)) {
          results.push(rel);
        }
      }
    });
  }

  walk(fullPath);
  return results;
}

async function updateIndexManual(req, res) {
  const { entries, repo } = req.body;
  const token = getToken(req);
  const effectiveRepo = repo || memoryConfig.getRepoUrl();
  console.log('[updateIndexManual]', new Date().toISOString());
  const result = await updateIndexFileManually(entries, effectiveRepo, token);
  res.json({ status: 'success', entries: result });
}

module.exports = {
  saveMemory,
  readMemory,
  setMemoryRepo,
  saveLessonPlan,
  saveNote,
  getContextSnapshot,
  createUserProfile,
  setToken,
  tokenStatus,
  readPlan,
  saveContext,
  readContext,
  listMemoryFiles,
  updateOrInsertJsonEntry,
  updateIndexFile,
  updateIndexFileManually,
  scanMemoryFolderRecursively,
  updateIndexEntry,
  rebuildIndex,
  updateIndexManual
};
