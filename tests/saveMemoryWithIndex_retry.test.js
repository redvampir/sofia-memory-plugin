process.env.NO_GIT = "true";
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const axios = require('axios');
const router = require('../api/memory_routes');
const github = require('../tools/github_client');

(async function run(){
  // patch GitHub helpers to avoid network
  const origValidate = github.validateToken;
  const origExists = github.repoExists;
  github.validateToken = async () => ({ valid: true });
  github.repoExists = async () => ({ exists: true });

  // mock axios to simulate 5xx errors
  const origGet = axios.get;
  const origPut = axios.put;
  axios.get = async () => { const err = new Error('nf'); err.response = { status: 404 }; throw err; };
  let attempts = 0;
  axios.put = async () => { attempts++; const err = new Error('fail'); err.response = { status: 503, data: { message: 'Server Error' } }; throw err; };

  // capture original index to restore later
  const indexPath = path.join(__dirname, '..', 'memory', 'index.json');
  const origIndex = fs.readFileSync(indexPath, 'utf-8');

  const layer = router.stack.find(l => l.route && l.route.path === '/saveMemoryWithIndex');
  const handler = layer.route.stack[0].handle;

  const req = { body: { userId: null, repo: 'user/repo', token: 'tok', filename: 'memory/tmp_retry/test.md', content: 'Hi' }, headers: {} };
  const res = { statusCode: 200, body: null, status(c){ this.statusCode = c; return this; }, json(o){ this.body = o; } };

  await handler(req, res);

  assert.ok(attempts > 1, 'writeFileSafe should retry on failure');
  assert.strictEqual(res.statusCode, 503);
  assert.ok(res.body && res.body.detail === 'Server Error');

  // restore patches and cleanup
  github.validateToken = origValidate;
  github.repoExists = origExists;
  axios.get = origGet;
  axios.put = origPut;
  fs.rmSync(path.join(__dirname, '..', 'memory', 'tmp_retry'), { recursive: true, force: true });
  fs.writeFileSync(indexPath, origIndex, 'utf-8');

  console.log('saveMemoryWithIndex retry route test passed');
})();
