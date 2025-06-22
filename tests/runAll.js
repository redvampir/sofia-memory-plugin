const fs = require('fs');
const path = require('path');

const testDir = __dirname;

fs.readdirSync(testDir)
  .filter(f => f.endsWith('.test.js'))
  .forEach(file => {
    console.log(`Running ${file}`);
    require(path.join(testDir, file));
  });
