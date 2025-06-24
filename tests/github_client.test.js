const assert = require('assert');
const axios = require('axios');
const github = require('../tools/github_client');

(async function run(){
  const origGet = axios.get;
  const origPut = axios.put;
  let capturedUrl = null;
  axios.get = async () => { const err = new Error('nf'); err.response = { status: 404 }; throw err; };
  axios.put = async (url) => { capturedUrl = url; return { status: 201 }; };

  await github.writeFile('tok','user/repo','subdir/test.md','Hi','msg');
  assert.strictEqual(
    capturedUrl,
    'https://api.github.com/repos/user/repo/contents/subdir/test.md'
  );

  axios.get = origGet;
  axios.put = origPut;
  console.log('github_client path test passed');
})();

