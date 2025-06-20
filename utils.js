// Utility helpers for Sofia memory plugin

const tokenStore = require('./tokenStore');
const memoryConfig = require('./memoryConfig');

/**
 * Parse a chat command that configures memory settings for a user.
 *
 * Expected format (order may vary):
 *   "set memory for <userId> repo <repoUrl> token <ghp_xxx>"
 *
 * @param {string} message - raw chat text
 * @returns {{userId: string, repo: string, token: string}|null}
 */
function parseUserMemorySetup(message = '') {
  if (typeof message !== 'string') return null;

  const userMatch = message.match(/(?:for|user)\s+([\w_]+)/i);
  const repoMatch = message.match(/repo\s+(https?:\/\/github\.com\/[\w.-]+\/[\w.-]+\.git\/?)/i);
  const tokenMatch = message.match(/token\s+(ghp_[A-Za-z0-9]+)/i);

  if (!userMatch || !repoMatch || !tokenMatch) return null;

  const userId = userMatch[1];
  let repo = repoMatch[1].replace(/\/?$/, '');
  const token = tokenMatch[1];

  if (!/^[\w_]+$/.test(userId)) {
    console.warn('[parseUserMemorySetup] invalid userId', userId);
    return null;
  }
  if (!/^ghp_[A-Za-z0-9]+$/.test(token)) {
    console.warn('[parseUserMemorySetup] invalid token format');
    return null;
  }
  if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\.git$/.test(repo)) {
    console.warn('[parseUserMemorySetup] invalid repo url');
    return null;
  }

  tokenStore.setToken(userId, token);
  memoryConfig.setRepoUrl(userId, repo);
  console.log(`[MemorySetup] Configured user: ${userId}`);

  return { userId, repo, token };
}

module.exports = {
  parseUserMemorySetup
};

