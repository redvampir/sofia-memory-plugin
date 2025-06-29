const assert = require('assert');
const axios = require('axios');
const { restoreContext } = require('../utils/restore_context');

(async function run(){
  const origPost = axios.post;
  let called = false;
  axios.post = async (url, data) => {
    called = url.includes('/loadMemoryToContext') && data.userId === 'user123';
    return { data: { success: true } };
  };
  const res = await restoreContext('user123');
  axios.post = origPost;
  assert.ok(called, 'endpoint should be called');
  assert.deepStrictEqual(res, { success: true });
  console.log('restoreContext api test passed');
})();
