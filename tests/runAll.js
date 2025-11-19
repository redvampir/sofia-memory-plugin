const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

require('ts-node/register/transpile-only');

if (!process.env.TOKEN_SECRET) {
  // Тестовый запуск не должен падать из-за отсутствия реального секрета:
  // выдаём детерминированный ключ только для локальных/CI тестов.
  process.env.TOKEN_SECRET = 'test_suite_token_secret';
  console.warn('[tests] TOKEN_SECRET не задан, используется тестовый ключ');
}

const testDir = __dirname;

const files = [];

function collect(dir) {
  fs.readdirSync(dir).forEach(f => {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) {
      collect(p);
    } else if (f.endsWith('.test.js') || f.endsWith('.test.ts')) {
      files.push(p);
    }
  });
}

collect(testDir);
files.sort();

files.forEach(file => {
  console.log(`Running ${path.relative(testDir, file)}`);
  const baseArgs = ['-r', 'ts-node/register/transpile-only'];
  const args = [...baseArgs, file];
  const env = file.endsWith('.test.ts')
    ? { ...process.env, TS_NODE_COMPILER_OPTIONS: JSON.stringify({ module: 'commonjs' }) }
    : process.env;
  execFileSync('node', args, { stdio: 'inherit', env });
});
