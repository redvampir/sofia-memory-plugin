process.env.NO_GIT = "true";
const assert = require('assert');
const axios = require('axios');
const { listUserRepos, clearCache } = require('../logic/github_repo');

(async function run(){
  clearCache();
  const origGet = axios.get;
  let count = 0;
  axios.get = async () => { count++; return { data: ['r'] }; };

  await listUserRepos('tok');
  await listUserRepos('tok');
  assert.strictEqual(count, 1, 'result cached');

  clearCache();
  await listUserRepos('tok');
  assert.strictEqual(count, 2, 'cache cleared');

  axios.get = origGet;
  clearCache();
  console.log('github repo cache test passed');
})();
