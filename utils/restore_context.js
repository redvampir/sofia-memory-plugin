const axios = require('axios');

/**
 * Request context restoration via API.
 * @param {string|null} userId user identifier
 * @returns {Promise<object>} API response
 */
async function restoreContext(userId) {
  const endpoint = 'https://sofia-memory.onrender.com/loadMemoryToContext';
  try {
    const res = await axios.post(endpoint, { userId });
    return res.data;
  } catch (e) {
    console.error('[restoreContext] request failed', e.message);
    throw e;
  }
}

module.exports = { restoreContext };
