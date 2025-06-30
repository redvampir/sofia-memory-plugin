process.env.NO_GIT = "true";
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const axios = require('axios');
const { createOrUpdateRepoIndex, updateRepoIndexEntry } = require('../logic/github_repo');

(async function run(){
  const origGet = axios.get;
  axios.get = async () => ({ data: { tree: [ { path: 'README.md', type: 'blob' } ] } });

  const dir = path.join(__dirname,'..','memory','github');
  fs.rmSync(dir,{recursive:true,force:true});

  await createOrUpdateRepoIndex('tok','owner','repo');
  const indexPath = path.join(dir,'owner-repo-index.json');
  let data = JSON.parse(fs.readFileSync(indexPath,'utf-8'));
  assert.strictEqual(data.length,1);

  await updateRepoIndexEntry('owner','repo','src/new.js',{ analyzed:true });
  data = JSON.parse(fs.readFileSync(indexPath,'utf-8'));
  const added = data.find(e => e.path==='src/new.js');
  assert.ok(added && added.analyzed);

  axios.get = origGet;
  fs.rmSync(dir,{recursive:true,force:true});
  console.log('repo dynamic index update tests passed');
})();
