const fs = require('fs');
const path = require('path');
const { readMemory } = require('./core/storage');

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
  return readMemory(userId, repo, token, filePath.replace(/^\/+/, ''));
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

      if (Array.isArray(index)) {
        const lessons = [];
        index.forEach(entry => {
          if (!entry || !entry.path) return;
          const abs = path.join(__dirname, entry.path);
          if (!fs.existsSync(abs)) {
            if (debug) skipped.push(`${entry.path} (missing)`);
            return;
          }
          const type = entry.type || '';
          if (type && type !== 'lesson' && type !== 'plan') {
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

      if (debug) {
        console.log('[restoreContext] loaded plan', !!plan);
        console.log('[restoreContext] loaded profile', !!profile);
        console.log('[restoreContext] loaded lesson', !!lesson);
        console.log('[restoreContext] restored', restored.filter(Boolean).length, 'files');
        if (skipped.length) console.log('[restoreContext] skipped', skipped.join(', '));
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
    let planPath = '';
    let profilePath = '';
    if (Array.isArray(index)) {
      for (const entry of index) {
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
    planPath = planPath ? path.join(__dirname, planPath) : '';
    profilePath = profilePath ? path.join(__dirname, profilePath) : '';
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
