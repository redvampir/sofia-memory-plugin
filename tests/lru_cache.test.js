const assert = require('assert');
const LRUCache = require('../utils/lru_cache');

(async function run(){
  const cache = new LRUCache(2, 10);
  cache.set('a', 1);
  cache.set('b', 2);
  assert.strictEqual(cache.get('a'), 1, 'retrieve existing');
  cache.set('c', 3);
  assert.strictEqual(cache.get('b'), undefined, 'oldest evicted');
  await new Promise(r => setTimeout(r, 15));
  assert.strictEqual(cache.get('a'), undefined, 'expired entry removed');
  console.log('lru cache test passed');
})();
