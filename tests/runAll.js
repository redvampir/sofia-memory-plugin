const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const testDir = __dirname;

const files = [];
function collect(dir) {
  fs.readdirSync(dir).forEach(f => {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) {
      collect(p);
    } else if (f.endsWith('.test.js')) {
      files.push(p);
    }
  });
}

collect(testDir);
files.sort();

files.forEach(file => {
  console.log(`Running ${path.relative(testDir, file)}`);
  execFileSync('node', [file], { stdio: 'inherit' });
});
