const fs = require('fs');
const path = require('path');
const ROOT_DIR = path.join(__dirname, '..');
const { get_file } = require('./storage');
const rootConfig = require('../config');
const context_state = require('../tools/context_state');
const logger = require('../utils/logger');

/**
 * Helper to read a file either from GitHub or local disk.
 * @param {string} filePath relative file path
 * @param {object} [opts]
 * @param {string} [opts.userId] user identifier
 * @param {string} [opts.repo] repository URL
 * @param {string} [opts.token] GitHub token
 * @returns {Promise<string>} file contents
 */
async function readFile(filePath, opts = {}) {
  const { userId, repo, token, source = 'index.json' } = opts;
  const normalized = filePath.replace(/^\/+/, '');
  console.log(`[readFile] ${source} -> ${normalized}`);
  try {
    const { content } = await get_file(userId, repo, token, normalized);
    console.log(`[readFile] success ${normalized}`);
    return content;
  } catch (e) {
    console.warn(`[readFile] fail ${normalized}`, e.message);
    throw e;
  }
}

async function loadIndexFile(debug, opts = {}) {
  const indexPath = opts.indexPath || 'memory/index.json';
  const { userId, repo, token } = opts;
  const attempts = [];

  const pluginInfo = rootConfig.getPluginRepo ? rootConfig.getPluginRepo() : {};

  const sources = [
    { label: 'user', repo, token },
    { label: 'plugin', repo: pluginInfo.repo, token: pluginInfo.token || token },
    { label: 'local', repo: null, token: null },
  ];

  for (const src of sources) {
    try {
      if (debug)
        console.log(
          `[restoreContext] trying ${indexPath} from ${src.label} repo`,
          src.repo || 'local'
        );
      const data = await readFile(indexPath, {
        userId,
        repo: src.repo,
        token: src.token,
      });
      return data;
    } catch (e) {
      attempts.push(`${src.label}:${src.repo || 'local'}`);
      if (debug)
        console.warn(
          `[restoreContext] failed from ${src.label} repo ${src.repo || 'local'}`,
          e.message
        );
    }
  }

  throw new Error(`index.json not found. Tried ${attempts.join(', ')}`);
}

/**
 * Restore plan, profile and current lesson from memory.
 * @param {boolean} [debug=false] enable verbose logging
 * @param {object} [opts] optional readFile parameters
 * @returns {Promise<{plan:string|null, profile:string|null, currentLesson:string|null}>}
 */
  async function restore_context(debug = false, opts = {}) {
    const userId = opts.userId || 'default';
    logger.info('[restore_context] start', { user: userId });
    try {
      const indexPath = opts.indexPath || process.env.INDEX_PATH || 'memory/index.json';
      if (debug) console.log('[restoreContext] loading', indexPath);
      const indexRaw = await loadIndexFile(debug, { ...opts, indexPath });
      let index;
      try {
        index = JSON.parse(indexRaw);
      } catch (e) {
        if (debug) console.error('[restoreContext] failed to parse index', e.message);
        index = {};
      }

      let planPath;
      let profilePath;
      let currentLessonPath;
      const restored = [];
      const skipped = [];

      if (Array.isArray(index) || index.lessons || index.plans) {
        const list = require('../tools/index_utils').index_to_array(index);
        const lessons = [];
        list.forEach(entry => {
          if (!entry || !entry.path) return;
          const abs = path.join(ROOT_DIR, entry.path);
          if (!fs.existsSync(abs)) {
            if (debug) skipped.push(`${entry.path} (missing)`);
            return;
          }
          const type = entry.type || '';
          if (
            type &&
            type !== 'lesson' &&
            type !== 'plan' &&
            type !== 'profile'
          ) {
            if (debug) skipped.push(`${entry.path} (type ${type})`);
            return;
          }
          restored.push(entry.path);
          if (!planPath && (type === 'plan' || /plan\.md$/i.test(entry.path))) {
            planPath = entry.path;
          } else if (!profilePath && (type === 'profile' || /profile\.md$/i.test(entry.path))) {
            profilePath = entry.path;
          }
          if (type === 'lesson' || /lesson/i.test(entry.path)) {
            lessons.push(entry);
          }
        });

        lessons.sort((a, b) => new Date(b.lastModified || 0) - new Date(a.lastModified || 0));
        if (lessons.length) currentLessonPath = lessons[0].path;
      } else {
        planPath = index.plan;
        profilePath = index.profile;
        currentLessonPath = index.currentLesson;
        if (debug) restored.push(planPath, profilePath, currentLessonPath);
      }

      if (debug) {
        console.log('[restoreContext] plan path', planPath);
        console.log('[restoreContext] profile path', profilePath);
        console.log('[restoreContext] lesson path', currentLessonPath);
      }

      const [plan, profile, lesson] = await Promise.all([
        planPath ? readFile(planPath, opts).catch(() => null) : Promise.resolve(null),
        profilePath ? readFile(profilePath, opts).catch(() => null) : Promise.resolve(null),
        currentLessonPath ? readFile(currentLessonPath, opts).catch(() => null) : Promise.resolve(null)
      ]);

      let summaries = [];
      try {
        const idxRaw = await readFile('memory/summaries/index.json', {
          ...opts,
          source: 'summaries-index'
        });
        const idx = JSON.parse(idxRaw);
        const files = Array.isArray(idx.files) ? idx.files : [];
        for (const f of files) {
          const filePath = f.file.startsWith('memory/') ? f.file : `memory/${f.file}`;
          try {
            const raw = await readFile(filePath, { ...opts, source: 'summary' });
            const data = JSON.parse(raw);
            const rel = p => p && p.replace(/^.*memory[\/]/, 'memory/').replace(/\\/g, '/');
            summaries.push({
              summary: data.summary,
              questionPath: rel(data.questionPath),
              answerPath: rel(data.answerPath)
            });
          } catch {}
        }
      } catch (e) {
        if (debug) console.warn('[restoreContext] summaries load fail', e.message);
      }

      const summaryText = summaries.length
        ? '\n\n## Summaries\n' +
          summaries
            .map(s => `- ${s.summary} (Q: ${s.questionPath}, A: ${s.answerPath})`)
            .join('\n')
        : '';

      const add = text => (text ? text + summaryText : summaryText || null);

      if (debug) {
        console.log('[restoreContext] loaded plan', !!plan);
        console.log('[restoreContext] loaded profile', !!profile);
        console.log('[restoreContext] loaded lesson', !!lesson);
        console.log('[restoreContext] restored', restored.filter(Boolean).length, 'files');
        if (skipped.length) console.log('[restoreContext] skipped', skipped.join(', '));
      }
      logger.info('[restore_context] success', { user: userId });
      return { plan: add(plan), profile: add(profile), currentLesson: add(lesson) };
    } catch (e) {
      logger.error('[restore_context]', e.message);
      return { plan: null, profile: null, currentLesson: null };
    }
  }

function fileEmpty(p) {
  return !fs.existsSync(p) || !fs.readFileSync(p, 'utf-8').trim();
}

function shouldRestoreContext({ userPrompt = '', gptOutput = '', tokensSinceLastRead = 0, userId = 'default' } = {}) {
  if (context_state.get_needs_refresh(userId)) return true;
  try {
    const idxPath = path.join(ROOT_DIR, 'memory', 'index.json');
    if (fileEmpty(idxPath)) return true;
    const index = JSON.parse(fs.readFileSync(idxPath, 'utf-8'));
    let planPath = '';
    let profilePath = '';
    if (Array.isArray(index) || index.lessons || index.plans) {
      const list = require('../tools/index_utils').index_to_array(index);
      for (const entry of list) {
        if (!entry || !entry.path) continue;
        if (!planPath && (entry.type === 'plan' || /plan\.md$/i.test(entry.path))) {
          planPath = entry.path;
        } else if (!profilePath && (entry.type === 'profile' || /profile\.md$/i.test(entry.path))) {
          profilePath = entry.path;
        }
      }
    } else {
      planPath = index.plan;
      profilePath = index.profile;
    }
    planPath = planPath ? path.join(ROOT_DIR, planPath) : '';
    profilePath = profilePath ? path.join(ROOT_DIR, profilePath) : '';
    if (fileEmpty(planPath) || fileEmpty(profilePath)) return true;
  } catch {
    return true;
  }

  const totalTokens = context_state.get_tokens(userId) + tokensSinceLastRead;
  if (totalTokens > 2000) {
    context_state.set_needs_refresh(true, userId);
    return true;
  }

  const promptTriggers = [/restore context/i, /!debug-restore/i, /did you forget/i, /ты ничего не помнишь/i, /ты потеряла контекст/i, /вспомни урок/i];
  if (promptTriggers.some(r => r.test(userPrompt))) {
    context_state.set_needs_refresh(true, userId);
    return true;
  }

  const gptTriggers = [/what lesson\??/i, /which lesson/i, /memory loss/i];
  if (gptTriggers.some(r => r.test(gptOutput))) return true;

  return false;
}

async function maybeRestoreContext({ debug = false, testMode = false, userPrompt = '', gptOutput = '', tokensSinceLastRead = 0, userId = 'default' } = {}) {
  if (!shouldRestoreContext({ userPrompt, gptOutput, tokensSinceLastRead, userId })) {
    return { restored: false };
  }

  logger.info('[maybeRestoreContext] need restore', { user: userId });

  if (testMode) {
    console.log('⚠️ I detected missing context. Do you want me to restore it from memory?');
    return { restored: false, confirmationNeeded: true };
  }

  const context = await restore_context(debug, { userId });
  context_state.set_needs_refresh(false, userId);
  context_state.reset_tokens(userId);
  logger.info('[maybeRestoreContext] restored', { user: userId });
  return { restored: true, context };
}

module.exports = {
  restore_context,
  readFile,
  shouldRestoreContext,
  maybeRestoreContext
};
