const assert = require('assert');
const axios = require('axios');
const { restoreContext } = require('../utils/restore_context');

(async function run(){
  const origPost = axios.post;
  let called = false;
  const logs = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...a) => logs.push(a.join(' '));
  console.error = (...a) => logs.push(a.join(' '));
  axios.post = async (url, data) => {
    called = url.includes('/loadMemoryToContext') && data.userId === 'user123';
    return { data: { success: true } };
  };
  const res = await restoreContext('user123');
  axios.post = origPost;
  console.log = origLog;
  console.error = origErr;
  assert.ok(called, 'endpoint should be called');
  assert.deepStrictEqual(res, { success: true });
  assert.ok(logs.find(l => l.includes('\u043a\u043e\u043d\u0442\u0435\u043a\u0441\u0442 \u0432\u043e\u0441\u0441\u0442\u0430\u043d\u043e\u0432\u043b\u0435\u043d')));
  console.log('restoreContext api test passed');
})();
