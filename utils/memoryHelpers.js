const path = require('path');
const rootConfig = require('../rootConfig');
const tokenStore = require('../tokenStore');
const memoryConfig = require('../memoryConfig');
const { normalizeMemoryPath } = require('./fileUtils');
const { detectMarkdownCategory } = require('../markdownCategory');

const DEBUG = process.env.DEBUG === 'true';

function logDebug(...args) {
  if (DEBUG) console.log(...args);
}

function getRepoInfo(relPath, userId, repoOverride, tokenOverride) {
  const normalized = normalizeMemoryPath(relPath);
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

  if (!repo) repo = memoryConfig.getRepoUrl(userId);
  if (!token) token = tokenStore.getToken(userId);

  return { repo, token };
}

function extractToken(req) {
  if (req.body && req.body.token) return req.body.token;
  const auth = req.headers['authorization'];
  if (auth && auth.startsWith('token ')) return auth.slice(6);
  const userId = (req.body && req.body.userId) || null;
  if (userId) {
    const stored = tokenStore.getToken(userId);
    if (stored) return stored;
  }
  return null;
}

function categorizeMemoryFile(name) {
  const lower = name.toLowerCase();
  const ext = path.extname(lower);

  if (ext === '.md') return detectMarkdownCategory(name);

  if (lower === 'plan.md' || lower.endsWith('plan.md')) return 'plan';
  if (lower.includes('lesson')) return 'lesson';
  if (lower.includes('note')) return 'note';
  if (lower.includes('context')) return 'context';
  if (lower.includes('practice')) return 'practice';

  if (['.txt', '.json'].includes(ext)) return 'lesson';
  if (
    ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.html', '.css', '.c', '.cpp'].includes(ext)
  )
    return 'project';
  if (['.png', '.jpg', '.jpeg', '.svg', '.gif'].includes(ext)) return 'project';

  return 'memory';
}

module.exports = { getRepoInfo, extractToken, categorizeMemoryFile, logDebug };
