process.env.NO_GIT = "true";
const assert = require('assert');
const context_state = require('../tools/context_state');

async function run() {
  context_state.reset_tokens('u1');
  context_state.reset_tokens('u2');
  context_state.increment_tokens(10, 'u1');
  context_state.increment_tokens(20, 'u2');
  assert.strictEqual(context_state.get_tokens('u1'), 10);
  assert.strictEqual(context_state.get_tokens('u2'), 20);
  context_state.reset_tokens('u1');
  assert.strictEqual(context_state.get_tokens('u1'), 0);
  assert.strictEqual(context_state.get_tokens('u2'), 20);
  console.log('context multi-user tests passed');
}
run();
