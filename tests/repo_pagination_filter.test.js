process.env.NO_GIT = "true";
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const axios = require('axios');
const {
  getRepoContents,
  filterRepoFiles,
  mergeRepoFilesIntoIndex,
} = require('../logic/github_repo');

(async function run(){
  const origGet = axios.get;
  const pages = {
    1: [
      { name:'a.js', path:'a.js', type:'file' },
      { name:'b.txt', path:'b.txt', type:'file' }
    ],
    2: [
      { name:'c.js', path:'c.js', type:'file' }
    ]
  };
  axios.get = async url => {
    const m = url.match(/[?&]page=(\d+)/);
    const p = m ? parseInt(m[1],10) : 1;
    return { data: pages[p] || [] };
  };

  const dir = path.join(__dirname,'..','memory','github');
  fs.rmSync(dir, { recursive:true, force:true });

  let list = await getRepoContents('tok','owner','repo','',1,2);
  assert.strictEqual(list.length,2,'page one');
  let filtered = filterRepoFiles(list,'.js');
  await mergeRepoFilesIntoIndex('owner','repo',filtered);

  let indexPath = path.join(dir,'owner-repo-index.json');
  let data = JSON.parse(fs.readFileSync(indexPath,'utf-8'));
  assert.strictEqual(data.length,1,'index after first page');
  assert.ok(data.find(e => e.path==='a.js'));

  list = await getRepoContents('tok','owner','repo','',2,2);
  filtered = filterRepoFiles(list,'.js');
  await mergeRepoFilesIntoIndex('owner','repo',filtered);

  data = JSON.parse(fs.readFileSync(indexPath,'utf-8'));
  assert.strictEqual(data.length,2,'index after second page');
  assert.ok(data.find(e => e.path==='c.js'));

  axios.get = origGet;
  fs.rmSync(dir, { recursive:true, force:true });
  console.log('pagination filter tests passed');
})();
