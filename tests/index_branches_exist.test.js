process.env.NO_GIT = "true";
const fs = require('fs');
const path = require('path');
const assert = require('assert');

(function run() {
  const rootPath = path.join(__dirname, '..', 'memory', 'index.json');
  const root = JSON.parse(fs.readFileSync(rootPath, 'utf-8'));
  if (Array.isArray(root.branches)) {
    root.branches.forEach(b => {
      const p = path.join(__dirname, '..', 'memory', b.path);
      assert.ok(fs.existsSync(p), `Missing branch index file: ${b.path}`);
    });
  }
  console.log('index branches exist test passed');
})();
