const assert = require('assert');
const axios = require('axios');
const { restoreContext } = require('../utils/restore_context');

(async function run(){
  const origPost = axios.post;
  const logs = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...a) => logs.push(a.join(' '));
  console.error = (...a) => logs.push(a.join(' '));
  axios.post = async () => { throw new Error('fail'); };
  let threw = false;
  try {
    await restoreContext('bad');
  } catch {
    threw = true;
  }
  axios.post = origPost;
  console.log = origLog;
  console.error = origErr;
  assert.ok(threw, 'should throw on failure');
  assert.ok(logs.find(l => l.includes('\u043e\u0448\u0438\u0431\u043a\u0430 \u0432\u043e\u0441\u0441\u0442\u0430')));
  console.log('restoreContext failure test passed');
})();
