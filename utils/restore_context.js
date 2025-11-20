const axios = require('axios');
const logger = require('./logger');

function logRestoreAction(userId, success) {
  const msg = success
    ? `контекст восстановлен для пользователя: ${userId}`
    : `ошибка восстановления контекста для пользователя: ${userId}`;
  if (success) {
    logger.info(msg);
    console.log(msg);
  } else {
    logger.error(msg);
    console.error(msg);
  }
}

/**
 * Request context restoration via API.
 * @param {string|null} userId user identifier
 * @returns {Promise<object>} API response
 */
async function restoreContext(userId) {
  const endpoint = 'https://sofia-memory-plugin.onrender.com/loadMemoryToContext';
  try {
    const res = await axios.post(endpoint, { userId });
    logRestoreAction(userId, true);
    return res.data;
  } catch (e) {
    logRestoreAction(userId, false);
    logger.error('[restoreContext] request failed', e.message);
    throw e;
  }
}

module.exports = { restoreContext, logRestoreAction };
