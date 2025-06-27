process.env.NO_GIT = "true";
const assert = require('assert');
const { setMemoryRepo, checkAndRestoreContext, getTokenCounter, formatTokenCounter } = require('../memory');
const context_state = require('../tools/context_state');

async function run() {
  await setMemoryRepo(null, null);
  context_state.reset_tokens();
  context_state.set_needs_refresh(false);

  context_state.increment_tokens(150);
  let info = getTokenCounter();
  assert.strictEqual(info.used, 150);
  assert.ok(formatTokenCounter(true).includes('150/'));

  const res = await checkAndRestoreContext('practice', 1950);
  assert.ok(res.restored, 'context should refresh after limit');
  info = getTokenCounter();
  assert.strictEqual(info.used, 0);
  assert.ok(formatTokenCounter(true).includes('0/'));

  console.log('token counter tests passed');
}

run();
