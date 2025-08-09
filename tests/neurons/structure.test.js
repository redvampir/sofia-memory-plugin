const assert = require('assert');
const StructureMirrorNeuron = require('../../src/generator/neurons/StructureMirrorNeuron');

function run() {
  const neuron = new StructureMirrorNeuron();
  const input = 'The ball was kicked by John. Did Mary catch it? What a great game!';
  const style = neuron.analyze(input);

  assert.strictEqual(style.structure.declarative, 1);
  assert.strictEqual(style.structure.interrogative, 1);
  assert.strictEqual(style.structure.exclamatory, 1);
  assert.ok(Math.abs(style.passiveRatio - 1 / 3) < 0.01, 'Passive ratio mismatch');

  const output = neuron.generate();
  const sentences = output.match(/[^.!?]+[.!?]/g) || [];
  assert.strictEqual(sentences.length, 3, 'Should generate same number of sentences');
  assert.ok(sentences[0].trim().endsWith('.'), 'First sentence should be declarative');
  assert.ok(sentences[1].trim().endsWith('?'), 'Second sentence should be interrogative');
  assert.ok(sentences[2].trim().endsWith('!'), 'Third sentence should be exclamatory');
  assert.ok(sentences.some(s => /\b(be|am|is|are|was|were|been|being)\b/.test(s) && /by/.test(s)), 'Passive voice missing');

  console.log('StructureMirrorNeuron tests passed');
}

run();
