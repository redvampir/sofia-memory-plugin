const fs = require('fs');
const path = require('path');
const github = require('./githubClient');
const tokenStore = require('./tokenStore');
const memoryConfig = require('./memoryConfig');

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
  const { userId, repo, token } = opts;
  const normalized = filePath.replace(/^\/+/, '');
  const finalRepo = repo || memoryConfig.getRepoUrl(userId);
  const finalToken = token || tokenStore.getToken(userId);

  if (finalRepo && finalToken) {
    try {
      return await github.readFile(finalToken, finalRepo, normalized);
    } catch (e) {
      console.error(`[readFile] GitHub fetch failed for ${normalized}`, e.message);
    }
  }

  const abs = path.join(__dirname, normalized);
  if (fs.existsSync(abs)) {
    return fs.readFileSync(abs, 'utf-8');
  }
  throw new Error(`File not found: ${normalized}`);
}

/**
 * Restore plan, profile and current lesson from memory.
 * @param {boolean} [debug=false] enable verbose logging
 * @param {object} [opts] optional readFile parameters
 * @returns {Promise<{plan:string|null, profile:string|null, currentLesson:string|null}>}
 */
async function restoreContext(debug = false, opts = {}) {
  try {
    const indexPath = 'memory/index.json';
    if (debug) console.log('[restoreContext] loading', indexPath);
    const indexRaw = await readFile(indexPath, opts);
    const index = JSON.parse(indexRaw);

    const planPath = index['plan'];
    const profilePath = index['profile'];
    const currentLessonPath = index['currentLesson'];

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

    if (debug) {
      console.log('[restoreContext] loaded plan', !!plan);
      console.log('[restoreContext] loaded profile', !!profile);
      console.log('[restoreContext] loaded lesson', !!lesson);
    }

    return { plan, profile, currentLesson: lesson };
  } catch (e) {
    console.error('[restoreContext]', e.message);
    return { plan: null, profile: null, currentLesson: null };
  }
}

function fileEmpty(p) {
  return !fs.existsSync(p) || !fs.readFileSync(p, 'utf-8').trim();
}

function shouldRestoreContext({ userPrompt = '', gptOutput = '', tokensSinceLastRead = 0 } = {}) {
  try {
    const idxPath = path.join(__dirname, 'memory', 'index.json');
    if (fileEmpty(idxPath)) return true;
    const index = JSON.parse(fs.readFileSync(idxPath, 'utf-8'));
    const planPath = path.join(__dirname, index.plan || '');
    const profilePath = path.join(__dirname, index.profile || '');
    if (fileEmpty(planPath) || fileEmpty(profilePath)) return true;
  } catch {
    return true;
  }

  if (tokensSinceLastRead > 3000) return true;

  const promptTriggers = [/restore context/i, /!debug-restore/i, /did you forget/i];
  if (promptTriggers.some(r => r.test(userPrompt))) return true;

  const gptTriggers = [/what lesson\??/i, /which lesson/i, /memory loss/i];
  if (gptTriggers.some(r => r.test(gptOutput))) return true;

  return false;
}

async function maybeRestoreContext({ debug = false, testMode = false, userPrompt = '', gptOutput = '', tokensSinceLastRead = 0 } = {}) {
  if (!shouldRestoreContext({ userPrompt, gptOutput, tokensSinceLastRead })) {
    return { restored: false };
  }

  if (testMode) {
    console.log('⚠️ I detected missing context. Do you want me to restore it from memory?');
    return { restored: false, confirmationNeeded: true };
  }

  const context = await restoreContext(debug);
  return { restored: true, context };
}

module.exports = {
  restoreContext,
  readFile,
  shouldRestoreContext,
  maybeRestoreContext
};
