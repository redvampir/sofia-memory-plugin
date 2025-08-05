const assert = require('assert');
const { TieredMemory } = require('../src/memory/tiered_memory');

(async function run(){
  const archiveStore = new Map();
  const archive = {
    async load(key){ return archiveStore.get(key); },
    async store(key,val){ archiveStore.set(key,val); }
  };
  const mem = new TieredMemory({ hotSize:1, coldSize:1, archive });

  await mem.store('a','A');
  await mem.store('b','B');
  assert.deepStrictEqual(mem.hot.keys(), ['b'], 'b should be hot');
  assert.deepStrictEqual(mem.cold.keys(), ['a'], 'a should be cold');

  await mem.store('c','C');
  assert.deepStrictEqual(mem.hot.keys(), ['c'], 'c promoted to hot');
  assert.deepStrictEqual(mem.cold.keys(), ['b'], 'b demoted to cold');
  assert.strictEqual(archiveStore.get('a'), 'A', 'a moved to archive');

  const b = await mem.load('b');
  assert.strictEqual(b, 'B', 'load b from cold');
  assert.deepStrictEqual(mem.hot.keys(), ['b'], 'b promoted to hot');
  assert.deepStrictEqual(mem.cold.keys(), ['c'], 'c demoted to cold');

  const a = await mem.load('a');
  assert.strictEqual(a, 'A', 'load a from archive');
  assert.deepStrictEqual(mem.hot.keys(), ['a'], 'a now hot');
  assert.deepStrictEqual(mem.cold.keys(), ['b'], 'b demoted to cold');
  assert.strictEqual(archiveStore.get('c'), 'C', 'c moved to archive');

  console.log('tiered memory test passed');
})();
