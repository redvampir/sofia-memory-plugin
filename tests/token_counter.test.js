process.env.NO_GIT = "true";
const assert = require('assert');
const { setMemoryRepo, checkAndRestoreContext, getTokenCounter, formatTokenCounter } = require('../src/memory');
const context_state = require('../tools/context_state');

async function run() {
  await setMemoryRepo(null, null);
  context_state.reset_tokens('user1');
  context_state.set_needs_refresh(false, 'user1');

  context_state.increment_tokens(150, 'user1');
  let info = getTokenCounter('user1');
  assert.strictEqual(info.used, 150);
  assert.ok(formatTokenCounter(true, 'user1').includes('150/'));

  const res = await checkAndRestoreContext('practice', 1950, 'user1');
  assert.ok(res.restored, 'context should refresh after limit');
  info = getTokenCounter('user1');
  assert.strictEqual(info.used, 0);
  assert.ok(formatTokenCounter(true, 'user1').includes('0/'));

  console.log('token counter tests passed');
}

run();
