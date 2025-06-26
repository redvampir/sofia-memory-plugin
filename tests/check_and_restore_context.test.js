process.env.NO_GIT = "true";
const assert = require('assert');
const { checkAndRestoreContext, setMemoryRepo } = require('../memory');
const context_state = require('../tools/context_state');

async function run() {
  setMemoryRepo(null, null);
  context_state.reset_tokens();

  await checkAndRestoreContext('theory', 50);

  const res = await checkAndRestoreContext('practice', 2100);
  assert.ok(res.restored, 'context should be restored when token limit exceeded');
  assert.strictEqual(context_state.get_tokens(), 0);

  console.log('checkAndRestoreContext tests passed');
}

run();
