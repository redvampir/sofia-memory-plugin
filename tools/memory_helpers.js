// Утилиты для работы с путями и конфигурацией памяти
const path = require('path');
const rootConfig = require('../config');
const token_store = require('./token_store');
const memory_config = require('./memory_config');
const { normalize_memory_path } = require('./file_utils');
const { detect_markdown_category } = require('../logic/markdown_category');
const { resolveUserId, getDefaultUserId } = require('../utils/default_user');

const DEBUG = process.env.DEBUG === 'true';

function logDebug(...args) {
  if (DEBUG) console.log(...args);
}

async function getRepoInfo(relPath, userId, repoOverride, tokenOverride) {
  const normalized = normalize_memory_path(relPath);
  const resolvedUserId = resolveUserId(userId);
  const cfg = rootConfig.loadConfig();
  let repo = repoOverride || null;
  let token = tokenOverride || null;

  if (cfg) {
    const usePlugin = normalized.startsWith('memory/instructions/');
    const info = usePlugin ? cfg.pluginRepo || {} : cfg.studentRepo || {};
    if (!repo) repo = info.repo || null;
    if (!token) token = info.token || null;
    if (DEBUG)
      console.log(`[repoSelect] ${usePlugin ? 'plugin' : 'student'} -> ${repo}`);
  }

  if (!repo) repo = await memory_config.getRepoUrl(resolvedUserId);
  if (!token) token = await token_store.getToken(resolvedUserId);

  return { repo, token };
}

async function extractToken(req) {
  if (req.body && req.body.token) return req.body.token;
  const auth = req.headers['authorization'];
  if (auth && auth.startsWith('token ')) return auth.slice(6);
  const userId = resolveUserId((req.body && req.body.userId) || null);
  const stored = await token_store.getToken(userId);
  if (stored) return stored;
  if (userId !== getDefaultUserId()) {
    const fallback = await token_store.getToken(getDefaultUserId());
    if (fallback) return fallback;
  }
  return null;
}

function categorizeMemoryFile(name) {
  const lower = name.toLowerCase();
  const ext = path.extname(lower);

  if (ext === '.md') return detect_markdown_category(name);

  if (lower === 'plan.md' || lower.endsWith('plan.md')) return 'plan';
  if (lower.includes('lesson')) return 'lesson';
  if (lower.includes('note')) return 'note';
  if (lower.includes('context')) return 'context';
  if (lower.includes('practice')) return 'practice';
  if (lower.includes('answer')) return 'answer';

  if (['.txt', '.json'].includes(ext)) return 'lesson';
  if (
    ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.html', '.css', '.c', '.cpp'].includes(ext)
  )
    return 'project';
  if (['.png', '.jpg', '.jpeg', '.svg', '.gif'].includes(ext)) return 'project';

  return 'memory';
}

function processMemoryFiles(filePath) {
  if (filePath.startsWith('memory/')) {
    return 'memory';
  }
  return 'project';
}

module.exports = {
  getRepoInfo,
  extractToken,
  categorizeMemoryFile,
  logDebug,
  processMemoryFiles,
};
