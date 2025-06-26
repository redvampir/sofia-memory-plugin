process.env.NO_GIT = "true";
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const index_tree = require('../tools/index_tree');

(function run(){
  const rootPath = path.join(__dirname, '..', 'memory', 'index.json');
  const branchPath = path.join(__dirname, '..', 'memory', 'drafts', 'index.json');
  const origRoot = fs.readFileSync(rootPath, 'utf-8');
  const origBranch = fs.readFileSync(branchPath, 'utf-8');

  const badRoot = JSON.parse(origRoot);
  delete badRoot.branches;
  fs.writeFileSync(rootPath, JSON.stringify(badRoot, null, 2), 'utf-8');
  let failed = false;
  try {
    index_tree.loadRoot();
  } catch (e) {
    failed = true;
  } finally {
    fs.writeFileSync(rootPath, origRoot, 'utf-8');
  }
  assert.ok(failed, 'root schema validation failed');

  const badBranch = JSON.parse(origBranch);
  delete badBranch.files;
  fs.writeFileSync(branchPath, JSON.stringify(badBranch, null, 2), 'utf-8');
  failed = false;
  try {
    index_tree.loadBranch('drafts');
  } catch (e) {
    failed = true;
  } finally {
    fs.writeFileSync(branchPath, origBranch, 'utf-8');
  }
  assert.ok(failed, 'branch schema validation failed');

  console.log('index schema validation test passed');
})();
