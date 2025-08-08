const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { RegenerateSession } = require('../src/regenerate_session');

async function run() {
  const tmpDir = path.join(__dirname, 'tmp');
  const logPath = path.join(tmpDir, 'reg.log');
  const session = new RegenerateSession('orig', { maxAttempts: 2, logPath });

  session.recordAttempt('hint1', 'ans1');
  assert.strictEqual(session.attempts, 1);
  session.recordAttempt('hint2', 'ans2', ['not_in_index.md']);
  assert.strictEqual(session.isLimitReached(), true);

  const final = session.accept();
  assert.strictEqual(final, 'ans2');
  assert.ok(fs.existsSync(logPath));
  const content = fs.readFileSync(logPath, 'utf-8');
  assert.ok(/ans2/.test(content));

  fs.unlinkSync(logPath);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('regenerate session tests passed');
}

run();
