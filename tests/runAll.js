const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const testDir = __dirname;

fs.readdirSync(testDir)
  .filter(f => f.endsWith('.test.js'))
  .forEach(file => {
    const p = path.join(testDir, file);
    console.log(`Running ${file}`);
    execFileSync('node', [p], { stdio: 'inherit' });
  });
