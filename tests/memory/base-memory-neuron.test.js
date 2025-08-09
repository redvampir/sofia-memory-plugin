const assert = require('assert');
const { BookMemoryNeuron } = require('../../src/memory/neurons');

// Test serialization
const neuron = new BookMemoryNeuron();
const json = neuron.toJSON();
assert.strictEqual(json.type, 'BookMemoryNeuron');
assert.deepStrictEqual(json.references, []);

// Test linking
const a = new BookMemoryNeuron();
const b = new BookMemoryNeuron();
a.link(b);
const linked = a.toJSON();
assert.strictEqual(linked.references.length, 1);
assert.strictEqual(linked.references[0].type, 'BookMemoryNeuron');

console.log('BaseMemoryNeuron tests passed');
