const assert = require('assert');
const StyleMirrorNeuron = require('../../src/generator/neurons/StyleMirrorNeuron');

function run() {
  const neuron = new StyleMirrorNeuron();
  const input = "Hello there! How are you doing? I'm fine.";
  const style = neuron.analyze(input);

  // avg sentence length: 8 words / 3 sentences
  assert.ok(Math.abs(style.avgSentenceLength - 8 / 3) < 0.01, 'Average sentence length mismatch');
  // punctuation frequency: 3 marks / 8 words
  assert.ok(Math.abs(style.punctuationFrequency - 3 / 8) < 0.01, 'Punctuation frequency mismatch');
  assert.strictEqual(style.formality, 'informal');

  const generated = neuron.generate();
  assert.ok(generated.endsWith('!'), 'Generated text should reflect punctuation style');
  console.log('StyleMirrorNeuron tests passed');
}

run();
