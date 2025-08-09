const fs = require('fs');
const path = require('path');
const assert = require('assert');
const WorldGenerator = require('../../src/generator/world/WorldGenerator');

(async () => {
  const tmpDir = path.join(__dirname, '..', 'tmp_world');
  fs.mkdirSync(tmpDir, { recursive: true });
  const file = path.join(tmpDir, 'book.json');
  const state = {
    style: { avgSentenceLength: 5, punctuationFrequency: 0.1, formality: 'informal' },
    emotion: { isUpper: false, isLower: false, lastChar: '.', emotion: 'happy' },
    structure: { order: ['declarative'], passiveRatio: 0 }
  };
  fs.writeFileSync(file, JSON.stringify(state, null, 2));

  const gen = new WorldGenerator();
  gen.prepareContext({ mirrorNeuronsPath: file });
  const world = gen.generate({ text: 'example', baseWorld: { base: true } });
  assert(world.mirrorNeurons && world.mirrorNeurons.length === 3, 'neurons not generated');

  const gen2 = new WorldGenerator({ baseSettings: { base: true } });
  gen2.prepareContext({ mirrorNeuronsPath: path.join(tmpDir, 'missing.json') });
  const world2 = gen2.generate({});
  assert.deepStrictEqual(world2, { base: true }, 'fallback to base settings failed');

  console.log('world generator test passed');
})();
