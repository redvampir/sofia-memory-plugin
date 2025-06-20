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
 * @param {object} [opts] optional parameters
 * @returns {Promise<{plan:string|null, profile:string|null, currentLesson:string|null}>}
 */
async function restoreContext(opts = {}) {
  try {
    const indexRaw = await readFile('memory/index.json', opts);
    const index = JSON.parse(indexRaw);

    const planPath = index['plan'];
    const profilePath = index['profile'];
    const currentLessonPath = index['currentLesson'];

    const [plan, profile, lesson] = await Promise.all([
      planPath ? readFile(planPath, opts).catch(() => null) : Promise.resolve(null),
      profilePath ? readFile(profilePath, opts).catch(() => null) : Promise.resolve(null),
      currentLessonPath ? readFile(currentLessonPath, opts).catch(() => null) : Promise.resolve(null)
    ]);

    return { plan, profile, currentLesson: lesson };
  } catch (e) {
    console.error('[restoreContext]', e.message);
    return { plan: null, profile: null, currentLesson: null };
  }
}

module.exports = { restoreContext, readFile };
