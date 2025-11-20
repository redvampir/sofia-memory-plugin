// Маршруты API для работы с хранилищем памяти
const express = require('express');
const path = require('path');
const fs = require('fs');
const github = require('../tools/github_client');
const router = express.Router();
const { checkAccess } = require('../utils/access_control');

const {
  writeFileSafe,
  updateOrInsertJsonEntry,
  updateIndexEntry,
  updatePlan,
  rebuildIndex,
  updateIndexFileManually,
  contextFilename,
  planFilename,
  indexFilename,
} = require('../logic/memory_operations');
const index_manager = require('../logic/index_manager');
const memory_config = require('../tools/memory_config');
const token_store = require('../tools/token_store');
const { setMemoryMode, getMemoryMode } = require('../utils/memory_mode');
const { generateTitleFromPath, inferTypeFromPath, normalizeMemoryPath, ensureDir } = require('../tools/file_utils');
const { parseMarkdownStructure, mergeMarkdownTrees, serializeMarkdownTree } = require('../logic/markdown_merge_engine');
const { getRepoInfo, extractToken, categorizeMemoryFile, logDebug } = require('../tools/memory_helpers');
const { logError } = require('../tools/error_handler');
const { readMarkdownFile } = require('../src/memory');
const { saveReferenceAnswer } = require('../src/memory');
const { loadMemoryToContext, loadContextFromIndex } = require('../src/memory');
const logger = require('../utils/logger');
const { restoreContext } = require('../utils/restore_context');
const { resolveUserId, getDefaultUserId } = require('../utils/default_user');

function logRestoreAction(userId, success) {
  if (success) {
    logger.info(`Контекст восстановлен для пользователя: ${userId}`);
  } else {
    logger.error(`Ошибка восстановления контекста для пользователя: ${userId}`);
  }
}

function getContextForUser(userId) {
  try {
    const data = fs.readFileSync(contextFilename(userId), 'utf-8');
    return data.trim();
  } catch {
    return '';
  }
}

async function restoreUserContext(userId) {
  try {
    await restoreContext(userId);
    logRestoreAction(userId, true);
  } catch (e) {
    logRestoreAction(userId, false);
    logger.error('[restoreUserContext]', e.message);
  }
}

async function checkContextForUser(userId) {
  const context = getContextForUser(userId);
  if (!context) {
    await restoreUserContext(userId);
  }
}

async function processUsersInBatches(users) {
  const batchSize = 10;
  for (let i = 0; i < users.length; i += batchSize) {
    const batch = users.slice(i, i + batchSize);
    for (const id of batch) {
      await checkContextForUser(id);
    }
  }
}

async function checkContextPeriodically() {
  const users = await memory_config.getAllUsers();
  if (!users.length) users.push(getDefaultUserId());
  await processUsersInBatches(users);
}

const contextCheckTimer = setInterval(checkContextPeriodically, 30 * 60 * 1000);
if (contextCheckTimer && typeof contextCheckTimer.unref === 'function') {
  contextCheckTimer.unref();
}

async function setMemoryRepo(req, res) {
  const { repoUrl, userId } = req.body;
  await memory_config.setRepoUrl(userId, repoUrl);
  res.json({ status: 'success', repo: repoUrl });
}

async function setMemoryModeRoute(req, res) {
  const { userId, mode } = req.body || {};
  const val = (mode || '').toLowerCase();
  if (!['local', 'github'].includes(val)) {
    return res.status(400).json({ status: 'error', message: 'Invalid mode' });
  }
  await setMemoryMode(resolveUserId(userId), val);
  res.json({ status: 'success', mode: val });
}

async function systemStatus(req, res) {
  const userId = resolveUserId((req.query.userId || (req.body || {}).userId || '').toString());
  const mode = await getMemoryMode(userId);
  const repo = await memory_config.getRepoUrl(userId);
  res.json({ status: 'success', mode, repo });
}

async function saveMemory(req, res) {
  const { repo, filename, content, userId } = req.body;
  const token = await extractToken(req);
  const { repo: effectiveRepo, token: effectiveToken } = await getRepoInfo(filename, userId, repo, token);

  if (!filename || content === undefined) {
    return res.status(400).json({ status: 'error', message: 'Missing required fields.' });
  }

  if (effectiveRepo) {
    if (!effectiveToken) {
      return res.status(401).json({ status: 'error', message: 'Missing GitHub token' });
    }
    try {
      const check = await github.validateToken(effectiveToken);
      if (!check.valid) {
        return res.status(401).json({ status: 'error', message: 'Invalid GitHub token' });
      }
    } catch (e) {
      logError('validateToken', e);
      return res.status(401).json({ status: 'error', message: 'Invalid GitHub token' });
    }
    try {
      const { exists, status } = await github.repoExistsSafe(
        effectiveToken,
        effectiveRepo
      );
      if (!exists) {
        if (status === 401) {
          return res.status(401).json({ status: 'error', message: 'Invalid GitHub token.' });
        }
        if (status === 403) {
          return res.status(403).json({ status: 'error', message: 'Access denied to repository.' });
        }
        return res.status(404).json({ status: 'error', message: 'Repository not found.' });
      }
    } catch (e) {
      logError('repoExists', e);
      return res.status(404).json({ status: 'error', message: 'Repository not found.' });
    }
  }

  const normalizedFilename = normalizeMemoryPath(filename);
  const filePath = path.join(__dirname, '..', normalizedFilename);
  ensureDir(filePath);

  let finalContent = content;
  const isMarkdown = normalizedFilename.endsWith('.md');
  if (isMarkdown) {
    try {
      let existing = '';
      if (effectiveRepo && effectiveToken) {
        try {
          existing = await fs.promises.readFile(filePath, 'utf-8');
        } catch {}
        try {
          existing = await github.readFile(effectiveToken, effectiveRepo, normalizedFilename);
        } catch (e) {
          logDebug('[saveMemory] no remote file', e.message);
        }
      } else if (fs.existsSync(filePath)) {
        existing = fs.readFileSync(filePath, 'utf-8');
      }
      if (existing) {
        const baseTree = parseMarkdownStructure(existing);
        const newTree = parseMarkdownStructure(content);
        const merged = mergeMarkdownTrees(baseTree, newTree, { dedupe: true });
        finalContent = serializeMarkdownTree(merged);
      }
    } catch (e) {
      logError('saveMemory markdown merge', e);
    }
  }

  if (filename.trim().endsWith('.json')) {
    let data;
    try {
      data = JSON.parse(content);
    } catch (e) {
      logError('saveMemory invalid JSON', e);
      return res.status(400).json({ status: 'error', message: 'Invalid JSON' });
    }
    try {
      await updateOrInsertJsonEntry(
        filePath,
        data,
        null,
        effectiveRepo,
        effectiveToken
      );
    } catch (e) {
      const code = e.status || 500;
      return res
        .status(code)
        .json({ status: code, message: e.message, detail: e.githubMessage });
    }
  } else {
    try {
      await writeFileSafe(filePath, finalContent);
    } catch (e) {
      const code = e.status || 500;
      return res
        .status(code)
        .json({ status: code, message: e.message, detail: e.githubMessage });
    }

    if (effectiveRepo) {
      if (!effectiveToken) {
        return res.status(401).json({ status: 'error', message: 'Missing GitHub token' });
      }
      const access = checkAccess(normalizedFilename, 'write');
      if (!access.allowed) {
        logError('access denied', new Error(access.message));
        return res.status(403).json({ status: 403, message: access.message });
      }
      try {
        await github.writeFileSafe(
          effectiveToken,
          effectiveRepo,
          normalizedFilename,
          finalContent,
          `update ${filename}`
        );
      } catch (e) {
        logError('GitHub write', e);
        const code = e.status || 500;
        return res
          .status(code)
          .json({ status: code, message: e.message, detail: e.githubMessage });
      }
    }
  }

  const meta = fs.existsSync(filePath) ? fs.statSync(filePath) : { mtime: new Date() };
  try {
    await updateIndexEntry(
      effectiveRepo,
      effectiveToken,
      {
        path: normalizedFilename,
        type: categorizeMemoryFile(path.basename(normalizedFilename)),
        title: generateTitleFromPath(normalizedFilename),
        description: '',
        lastModified: meta.mtime.toISOString(),
      },
      userId
    );
  } catch (e) {
    const code = e.status || 500;
    return res
      .status(code)
      .json({ status: code, message: e.message, detail: e.githubMessage });
  }

  if (normalizedFilename.startsWith('memory/') && normalizedFilename !== 'memory/index.json') {
    try {
      await index_manager.addOrUpdateEntry({
        path: normalizedFilename,
        title: generateTitleFromPath(normalizedFilename),
        type: inferTypeFromPath(normalizedFilename),
        lastModified: new Date().toISOString(),
      });
      await index_manager.saveIndex(effectiveToken, effectiveRepo, userId);
    } catch (e) {
      const code = e.status || 500;
      return res
        .status(code)
        .json({ status: code, message: e.message, detail: e.githubMessage });
    }
  }

  res.json({ status: 'success', action: 'saveMemory', filePath: normalizedFilename });
}

async function saveAnswer(req, res) {
  const { key, content, repo, userId } = req.body;
  const token = await extractToken(req);
  if (!key || content === undefined) {
    return res.status(400).json({ status: 'error', message: 'Missing key or content' });
  }
  try {
    const { repo: r, token: t } = await getRepoInfo(`memory/answers/${key}.md`, userId, repo, token);
    await saveReferenceAnswer(r, t, key, content);
    res.json({ status: 'success', path: `memory/answers/${key}.md` });
  } catch (e) {
    const code = e.status || 500;
    res.status(code).json({ status: code, message: e.message, detail: e.githubMessage });
  }
}

async function readMemory(req, res) {
  const { repo, filename, userId } = req.body;
  const token = await extractToken(req);
  const { repo: effectiveRepo, token: effectiveToken } = await getRepoInfo(filename, userId, repo, token);

  const normalizedFilename = normalizeMemoryPath(filename);
  const filePath = path.join(__dirname, '..', normalizedFilename);
  const isJson = normalizedFilename.endsWith('.json');

  logger.info(`[read] repo=${effectiveRepo || 'local'} file=${normalizedFilename}`);

  if (effectiveRepo) {
    if (!effectiveToken) return res.status(401).json({ status: 'error', message: 'Missing GitHub token' });
    try {
      const content = await github.readFile(effectiveToken, effectiveRepo, normalizedFilename);
      logger.info(`[read] success remote ${normalizedFilename}`);
      if (isJson) {
        try {
          const json = JSON.parse(content);
          return res.json({ status: 'success', content, json });
        } catch (e) {
          logError('readMemory parse json', e);
          return res.status(500).json({ status: 500, message: 'Failed to parse JSON' });
        }
      }
      return res.json({ status: 'success', content });
    } catch (e) {
      logger.error('[read] error remote', e.message);
      const code = e.status || 500;
      return res
        .status(code)
        .json({ status: code, message: e.message, detail: e.githubMessage });
    }
  }

  if (!fs.existsSync(filePath)) {
    logger.error('[read] file not found', filePath);
    return res.status(404).json({ status: 'error', message: 'File not found.' });
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  logger.info(`[read] success local ${normalizedFilename}`);
  if (isJson) {
    try {
      const json = JSON.parse(content);
      return res.json({ status: 'success', content, json });
    } catch (e) {
      logError('readMemory parse json', e);
      return res.status(500).json({ status: 500, message: 'Failed to parse JSON' });
    }
  }
  res.json({ status: 'success', content });
}

async function readFileRoute(req, res) {
  const { repo, filename, userId } = req.body || {};
  const token = await extractToken(req);
  const { repo: effectiveRepo, token: effectiveToken } = await getRepoInfo(filename, userId, repo, token);
  try {
    const content = await readMarkdownFile(filename, { repo: effectiveRepo, token: effectiveToken });
    res.json({ status: 'success', content });
  } catch (e) {
    const code = e.status || (/not found/i.test(e.message) ? 404 : 500);
    res.status(code).json({ status: code, message: e.message, detail: e.githubMessage });
  }
}

function readMemoryGET(req, res) {
  req.body = {
    repo: req.query.repo,
    filename: req.query.filename,
    userId: req.query.userId,
    token: req.query.token,
  };
  return readMemory(req, res);
}

async function saveLessonPlan(req, res) {
  const { title, plannedLessons, repo, userId } = req.body;
  const token = await extractToken(req);
  const { repo: effectiveRepo, token: effectiveToken } = await getRepoInfo('memory/plan.md', userId, repo, token);
  const done = title ? [title] : [];
  const upcoming = Array.isArray(plannedLessons) ? plannedLessons : [];

  try {
    const plan = await updatePlan({
      token: effectiveToken,
      repo: effectiveRepo,
      userId,
      updateFn: p => {
        p.done = [...new Set([...p.done, ...done])];
        p.upcoming = p.upcoming.filter(l => !done.includes(l));
        p.upcoming = [...new Set([...p.upcoming, ...upcoming])];
        return p;
      },
    });
    res.json({ status: 'success', action: 'saveLessonPlan', plan });
  } catch (e) {
    const code = e.status || 500;
    res.status(code).json({ status: code, message: e.message, detail: e.githubMessage });
  }
}

async function saveContext(req, res) {
  const { repo, content, userId } = req.body;
  const token = await extractToken(req);
  const { repo: effectiveRepo, token: effectiveToken } = await getRepoInfo('memory/context.md', userId, repo, token);

  ensureDir(contextFilename());
  try {
    await writeFileSafe(contextFilename(), content || '');
  } catch (e) {
    const code = e.status || 500;
    return res
      .status(code)
      .json({ status: code, message: e.message, detail: e.githubMessage });
  }

  if (effectiveRepo && effectiveToken) {
    const access = checkAccess('memory/context.md', 'write');
    if (!access.allowed) {
      logError('access denied', new Error(access.message));
      return res.status(403).json({ status: 403, message: access.message });
    }
    try {
      await github.writeFileSafe(
        effectiveToken,
        effectiveRepo,
        'memory/context.md',
        content || '',
        'update context'
      );
    } catch (e) {
      logError('GitHub write context', e);
      const code = e.status || 500;
      return res
        .status(code)
        .json({ status: code, message: e.message, detail: e.githubMessage });
    }
  }

  try {
    await rebuildIndex(effectiveRepo, effectiveToken, userId);
  } catch (e) {
    logError('saveContext rebuild', e);
    const code = e.status || 500;
    return res
      .status(code)
      .json({ status: code, message: e.message, detail: e.githubMessage });
  }

  res.json({ status: 'success', action: 'saveContext' });
}

async function readContext(req, res) {
  const { repo, userId } = req.body;
  const token = await extractToken(req);
  const { repo: effectiveRepo, token: effectiveToken } = await getRepoInfo('memory/context.md', userId, repo, token);

  ensureDir(contextFilename());

  if (effectiveRepo && effectiveToken) {
    try {
      const content = await github.readFile(effectiveToken, effectiveRepo, 'memory/context.md');
      return res.json({ status: 'success', content });
    } catch (e) {
      logError('GitHub read context', e);
    }
  }

  const content = fs.existsSync(contextFilename()) ? fs.readFileSync(contextFilename(), 'utf-8') : '';
  res.json({ status: 'success', content });
}

async function updateIndexManual(req, res) {
  const { entries, repo, userId } = req.body;
  const token = await extractToken(req);
  const { repo: effectiveRepo, token: effectiveToken } = await getRepoInfo('memory/index.json', userId, repo, token);
  try {
    const result = await updateIndexFileManually(entries, effectiveRepo, effectiveToken, userId);
    res.json({ status: 'success', entries: result });
  } catch (e) {
    const code = e.status || 500;
    res.status(code).json({ status: code, message: e.message, detail: e.githubMessage });
  }
}

async function getToken(req, res) {
  const userId = req.body && req.body.userId;
  const token = await token_store.getToken(userId);
  res.json({ token: token || null });
}

async function setToken(req, res) {
  const token = req.body && req.body.token ? req.body.token : '';
  const userId = req.body && req.body.userId;
  if (userId) await token_store.setToken(userId, token);
  res.json({ status: 'success', action: 'setToken', connected: !!token });
}

async function tokenStatus(req, res) {
  const userId = req.query.userId || (req.body && req.body.userId);
  const token = userId ? await token_store.getToken(userId) : null;
  res.json({ connected: !!token });
}

function readPlan(req, res) {
  try {
    ensureDir(planFilename());
    const content = fs.existsSync(planFilename()) ? fs.readFileSync(planFilename(), 'utf-8') : '{}';
    const plan = JSON.parse(content || '{}');
    res.json({ status: 'success', plan });
  } catch (e) {
    const code = e.status || 500;
    res.status(code).json({ status: code, message: e.message, detail: e.githubMessage });
  }
}

function readProfile(req, res) {
  const filePath = path.join(__dirname, '..', 'memory', 'profile.json');
  if (fs.existsSync(filePath)) {
    const data = fs.readFileSync(filePath, 'utf-8');
    res.type('application/json').send(data);
  } else {
    res.status(404).json({ status: 'error', message: 'Profile not found' });
  }
}

async function save(req, res) {
  const type = req.body && req.body.type;
  if (type === 'context') {
    return saveContext(req, res);
  }

  const { repo, token, filename, content } = req.body || {};
  if (!repo || !token || !filename || content === undefined) {
    return res
      .status(400)
      .json({ status: 'error', message: 'Missing repo, token, filename or content' });
  }

  try {
    const check = await github.validateToken(token);
    if (!check.valid) {
      return res.status(401).json({ status: 'error', message: 'Invalid GitHub token' });
    }

    const normalized = normalizeMemoryPath(filename);
    const access = checkAccess(normalized, 'write');
    if (!access.allowed) {
      logError('access denied', new Error(access.message));
      return res.status(403).json({ status: 403, message: access.message });
    }
    await github.writeFileSafe(token, repo, normalized, content, `Update ${normalized}`);
    res.json({ status: 'ok' });
  } catch (e) {
    logError('save endpoint', e);
    const code = e.status || 500;
    res.status(code).json({ status: code, message: e.message, detail: e.githubMessage });
  }
}

async function read(req, res) {
  const type = req.body && req.body.type;
  if (type === 'context') {
    return readContext(req, res);
  }
  return readMemory(req, res);
}

router.post('/save', save);
router.post('/saveMemory', saveMemory);
router.post('/readMemory', readMemory);
router.post('/read', read);
router.post('/readFile', readFileRoute);
router.get('/memory', readMemoryGET);
router.post('/setMemoryRepo', setMemoryRepo);
router.post('/memory/set-mode', setMemoryModeRoute);
router.get('/status', systemStatus);
router.post('/status', systemStatus);
router.post('/saveMemoryWithIndex', saveMemoryWithIndexRoute);
router.post('/loadMemoryToContext', loadMemoryToContextRoute);
router.post('/loadContextFromIndex', loadContextFromIndexRoute);
// Новые неймспейсы /api/* с сохранением обратной совместимости
router.post('/api/files/save', save);
router.post('/api/files/read', read);
router.post('/api/memory/save', saveMemory);
router.post('/api/memory/read', readMemory);
router.post('/api/memory/save-with-index', saveMemoryWithIndexRoute);
router.post('/api/memory/context', loadMemoryToContextRoute);
router.post('/api/memory/load-to-context', loadMemoryToContextRoute);
router.post('/api/memory/load-from-index', loadContextFromIndexRoute);
router.post('/api/lessons/save-plan', saveLessonPlan);
router.post('/api/lessons/save-answer', saveAnswer);
router.post('/api/system/switch_repo', setMemoryRepo);
router.get('/api/system/status', systemStatus);
router.post('/api/system/status', systemStatus);
router.post('/saveLessonPlan', saveLessonPlan);
async function saveMemoryWithIndexRoute(req, res) {
  const { userId, repo, token, filename, content } = req.body;
  const { repo: effectiveRepo, token: effectiveToken } = await getRepoInfo(filename, userId, repo, token || await extractToken(req));
  if (effectiveRepo) {
    if (!effectiveToken) {
      return res.status(401).json({ status: 'error', message: 'Missing GitHub token' });
    }
    try {
      const check = await github.validateToken(effectiveToken);
      if (!check.valid) {
        return res.status(401).json({ status: 'error', message: 'Invalid GitHub token' });
      }
    } catch (e) {
      logError('validateToken', e);
      return res.status(401).json({ status: 'error', message: 'Invalid GitHub token' });
    }
    try {
      const { exists, status } = await github.repoExistsSafe(
        effectiveToken,
        effectiveRepo
      );
      if (!exists) {
        if (status === 401) {
          return res.status(401).json({ status: 'error', message: 'Invalid GitHub token.' });
        }
        if (status === 403) {
          return res.status(403).json({ status: 'error', message: 'Access denied to repository.' });
        }
        return res.status(404).json({ status: 'error', message: 'Repository not found.' });
      }
    } catch (e) {
      logError('repoExists', e);
      return res.status(404).json({ status: 'error', message: 'Repository not found.' });
    }
  }
  try {
    const pathSaved = await index_manager.saveMemoryWithIndex(
      userId,
      effectiveRepo,
      effectiveToken,
      filename,
      content
    );
    res.json({ status: 'success', path: pathSaved });
  } catch (e) {
    const code = e.status || 500;
    res.status(code).json({ status: code, message: e.message, detail: e.githubMessage });
  }
}
router.post('/saveAnswer', saveAnswer);
router.post('/getToken', getToken);
router.post('/saveNote', (req, res) => res.json({ status: 'success', action: 'saveNote' }));
router.post('/getContextSnapshot', (req, res) => res.json({ status: 'success', context: {} }));
router.post('/createUserProfile', (req, res) => res.json({ status: 'success', action: 'createUserProfile' }));
router.post('/setToken', setToken);
router.get('/token/status', tokenStatus);
router.get('/tokenStatus', tokenStatus);
router.get('/readContext', readContext);
router.post('/saveContext', saveContext);
async function loadMemoryToContextRoute(req, res) {
  const { filename, repo, userId } = req.body || {};
  const token = await extractToken(req);
  if (!filename) {
    return res.status(400).json({ status: 'error', message: 'Missing filename' });
  }
  const { repo: effectiveRepo, token: effectiveToken } = await getRepoInfo(
    filename,
    userId,
    repo,
    token
  );
  try {
    const result = await loadMemoryToContext(
      filename,
      effectiveRepo,
      effectiveToken
    );
    res.json({ status: 'success', loaded: result.file });
  } catch (e) {
    const code = e.status || 500;
    res.status(code).json({ status: code, message: e.message, detail: e.githubMessage });
  }
}

async function loadContextFromIndexRoute(req, res) {
  const { index, repo, userId } = req.body || {};
  const token = await extractToken(req);
  if (!index) {
    return res.status(400).json({ status: 'error', message: 'Missing index' });
  }
  const { repo: effectiveRepo, token: effectiveToken } = await getRepoInfo(
    index,
    userId,
    repo,
    token
  );
  try {
    const result = await loadContextFromIndex(
      index,
      effectiveRepo,
      effectiveToken
    );
    res.json({ status: 'success', loaded: result ? result.files : [] });
  } catch (e) {
    const code = e.status || 500;
    res.status(code).json({ status: code, message: e.message, detail: e.githubMessage });
  }
}
router.post('/chat/setup', async (req, res) => {
  const text = req.body && req.body.text ? req.body.text : '';
  // Используем функцию разбора команды из утилит
  const { parse_user_memory_setup } = require('../utils/helpers');
  const parsed = await parse_user_memory_setup(text);
  if (!parsed) return res.status(400).json({ status: 'error', message: 'Invalid command' });
  const { userId, repo } = parsed;
  res.json({ status: 'success', message: `Memory configured for user: ${userId}`, repo });
});

router.post('/chat/create_memory_folder', async (req, res) => {
  const text = req.body && req.body.text ? req.body.text : '';
  const { parse_create_memory_folder } = require('../utils/helpers');
  const { createMemoryFolder } = require('../src/memory');
  const parsed = parse_create_memory_folder(text);
  if (!parsed)
    return res.status(400).json({ status: 'error', message: 'Invalid command' });
  const { name, init_index } = parsed;
  try {
    await createMemoryFolder(name, init_index);
    res.json({ status: 'success', folder: name });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

router.post('/chat/load_memory', async (req, res) => {
  const text = req.body && req.body.text ? req.body.text : '';
  const { parse_load_memory } = require('../utils/helpers');
  const { switchMemoryFolder } = require('../utils/memory_mode');
  const parsed = parse_load_memory(text);
  if (!parsed)
    return res.status(400).json({ status: 'error', message: 'Invalid command' });
  const { name } = parsed;
  try {
    const { index, plan } = await switchMemoryFolder(getDefaultUserId(), name);
    res.json({ status: 'success', folder: name, index, plan });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});
router.post('/mark_important', async (req, res) => {
  const { file, userId } = req.body || {};
  if (!file) {
    return res.status(400).json({ status: 'error', message: 'Missing file' });
  }
  try {
    const normalized = normalizeMemoryPath(file);
    const existing = index_manager.getByPath(normalized);
    const current = existing ? existing.importance_score || 0 : 0;
    const updated = await index_manager.updateMetadata(
      normalized,
      'importance_score',
      Math.min(current + 0.2, 1)
    );
    res.json({ status: 'success', importance_score: updated.importance_score });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});
router.post('/updateIndex', updateIndexManual);
router.get('/plan', readPlan);
router.get('/profile', readProfile);

// Export for tests (new camelCase names)
router._checkContextForUser = checkContextForUser;
router._processUsersInBatches = processUsersInBatches;

// Backward compatibility (deprecated)
router._check_context_for_user = checkContextForUser;
router._process_users_in_batches = processUsersInBatches;

module.exports = router;
