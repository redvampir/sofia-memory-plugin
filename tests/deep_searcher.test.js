const assert = require('assert');
const DeepSearcher = require('../src/generator/search/DeepSearcher');

class MockSource {
  constructor(results, delay = 0) {
    this.results = results;
    this.delay = delay;
  }
  async search() {
    await new Promise(r => setTimeout(r, this.delay));
    return this.results;
  }
}

(async function run() {
  // Tiered search and deduplication
  const hot = new MockSource(['a', 'b']);
  const warm = new MockSource(['b', 'c'], 20);
  const cold = new MockSource(['c', 'd'], 20);
  const ext = [new MockSource(['d', 'e'], 20)];
  const searcher = new DeepSearcher({ hotCache: hot, warmStorage: warm, coldStorage: cold, externalSources: ext, timeout: 100 });
  const res = await searcher.search('q');
  assert.deepStrictEqual(res.sort(), ['a', 'b', 'c', 'd', 'e'].sort(), 'tiered search with dedup');

  // Timeout control
  const slow = new MockSource(['x'], 200);
  const searcher2 = new DeepSearcher({ hotCache: hot, warmStorage: slow, timeout: 50 });
  const res2 = await searcher2.search('q');
  assert.deepStrictEqual(res2.sort(), ['a', 'b'].sort(), 'timeout excludes slow sources');

  console.log('deep searcher test passed');
})();

