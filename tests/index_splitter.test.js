process.env.NO_GIT = "true";
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { checkAndSplitIndex } = require('../tools/index_splitter');
const index_tree = require('../tools/index_tree');

(function run(){
  const idxPath = path.join(__dirname, '..', 'memory', 'drafts', 'index.json');
  const original = fs.readFileSync(idxPath, 'utf-8');
  const data = JSON.parse(original);
  for(let i=0;i<50;i++){
    data.files.push({title:`T${i}`, file:`drafts/t${i}.md`, tags:['t'], priority:'low', updated:'2024-01-01'});
  }
  fs.writeFileSync(idxPath, JSON.stringify(data, null, 2), 'utf-8');

  checkAndSplitIndex(idxPath, 1000);
  const part = path.join(__dirname, '..', 'memory', 'drafts', 'index.part2.json');
  assert.ok(fs.existsSync(part), 'part index created');
  const entries = index_tree.loadBranch('drafts');
  assert.ok(entries.length >= data.files.length, 'entries loaded from parts');

  fs.writeFileSync(idxPath, original, 'utf-8');
  if(fs.existsSync(part)) fs.unlinkSync(part);
  console.log('index splitter test passed');
})();
