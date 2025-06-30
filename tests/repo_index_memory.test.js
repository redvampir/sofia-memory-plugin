process.env.NO_GIT = "true";
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const axios = require('axios');
const { createOrUpdateRepoIndex } = require('../logic/github_repo');

(async function run(){
  const origGet = axios.get;
  axios.get = async () => ({ data: { tree: [
    { path: 'README.md', type: 'blob' },
    { path: 'memory/notes/note.md', type: 'blob' },
    { path: 'src/index.js', type: 'blob' }
  ] } });

  const dir = path.join(__dirname, '..', 'memory', 'github');
  fs.rmSync(dir, { recursive: true, force: true });

  await createOrUpdateRepoIndex('tok','owner','repo');

  const projectIndexPath = path.join(dir, 'owner-repo-index.json');
  const memoryIndexPath = path.join(dir, 'owner-repo-memory-index.json');

  assert.ok(fs.existsSync(projectIndexPath), 'project index created');
  assert.ok(fs.existsSync(memoryIndexPath), 'memory index created');

  const project = JSON.parse(fs.readFileSync(projectIndexPath, 'utf-8'));
  const memory = JSON.parse(fs.readFileSync(memoryIndexPath, 'utf-8'));

  assert.ok(project.find(e => e.path === 'src/index.js'), 'project file indexed');
  assert.ok(!project.find(e => e.path.startsWith('memory/')), 'memory files excluded from project index');
  assert.ok(memory.find(e => e.path === 'memory/notes/note.md'), 'memory file in memory index');

  axios.get = origGet;
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('repo index memory separation tests passed');
})();
