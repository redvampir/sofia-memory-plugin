process.env.NO_GIT = "true";
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const axios = require('axios');
const { createOrUpdateRepoIndex, markFileChecked } = require('../logic/github_repo');

(async function run(){
  const origGet = axios.get;
  axios.get = async () => ({ data: { tree: [
    { path: 'README.md', type: 'blob' },
    { path: 'src', type: 'tree' },
    { path: 'src/index.js', type: 'blob' }
  ] } });

  const dir = path.join(__dirname, '..', 'memory', 'github');
  fs.rmSync(dir, { recursive: true, force: true });

  await createOrUpdateRepoIndex('tok','owner','repo');
  const indexPath = path.join(dir, 'owner-repo-index.json');
  assert.ok(fs.existsSync(indexPath), 'index file created');
  let data = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  const entry = data.find(e => e.path === 'src/index.js');
  assert.ok(entry && !entry.checked, 'entry exists');

  await markFileChecked('owner','repo','src/index.js');
  data = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  const checked = data.find(e => e.path === 'src/index.js');
  assert.ok(checked.checked, 'file marked as checked');

  axios.get = origGet;
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('repo index tests passed');
})();
