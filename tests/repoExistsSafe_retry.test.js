process.env.NO_GIT = "true";
const assert = require('assert');
const axios = require('axios');
const github = require('../tools/github_client');

(async function run(){
  const origGet = axios.get;
  let attempts = 0;
  axios.get = async () => {
    attempts++;
    const err = new Error('fail');
    err.response = { status: 503, data: { message: 'Server Error' } };
    throw err;
  };

  const res = await github.repoExistsSafe('tok','user/repo',3);
  assert.ok(attempts > 1, 'repoExistsSafe should retry on failure');
  assert.strictEqual(res.exists, false);
  assert.strictEqual(res.status, 503);

  axios.get = origGet;
  console.log('repoExistsSafe retry test passed');
})();
