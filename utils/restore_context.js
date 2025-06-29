const axios = require('axios');
const logger = require('./logger');

function logRestoreAction(userId, success) {
  const msg = success
    ? `\u041a\u043e\u043d\u0442\u0435\u043a\u0441\u0442 \u0432\u043e\u0441\u0441\u0442\u0430\u043d\u043e\u0432\u043b\u0435\u043d \u0434\u043b\u044f \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044f: ${userId}`
    : `\u041e\u0448\u0438\u0431\u043a\u0430 \u0432\u043e\u0441\u0441\u0442\u0430\u043d\u043e\u0432\u043b\u0435\u043d\u0438\u044f \u043a\u043e\u043d\u0442\u0435\u043a\u0441\u0442\u0430 \u0434\u043b\u044f \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044f: ${userId}`;
  if (success) {
    logger.info(msg);
  } else {
    logger.error(msg);
  }
}

/**
 * Request context restoration via API.
 * @param {string|null} userId user identifier
 * @returns {Promise<object>} API response
 */
async function restoreContext(userId) {
  const endpoint = 'https://sofia-memory.onrender.com/loadMemoryToContext';
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
