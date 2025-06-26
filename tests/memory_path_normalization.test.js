const assert = require('assert');
const { normalize_memory_path } = require('../tools/file_utils');

(function run(){
  assert.strictEqual(normalize_memory_path('../etc/passwd'), 'memory/etc/passwd');
  assert.strictEqual(normalize_memory_path('memory/../etc/passwd'), 'memory/etc/passwd');
  assert.strictEqual(normalize_memory_path('/../../secret'), 'memory/secret');
  assert.strictEqual(normalize_memory_path('foo/../bar'), 'memory/bar');
  assert.strictEqual(normalize_memory_path('memory/bar'), 'memory/bar');
  assert.strictEqual(normalize_memory_path('..'), 'memory/');
  console.log('memory path normalization tests passed');
})();
