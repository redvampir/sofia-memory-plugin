const BaseMemoryNeuron = require('./BaseMemoryNeuron');

class BookMemoryNeuron extends BaseMemoryNeuron {
  constructor() {
    super();
    this.references = [];
  }

  extract(text) {
    return text;
  }

  link(neuron) {
    if (!(neuron instanceof BaseMemoryNeuron)) {
      throw new Error('link() expects a BaseMemoryNeuron instance');
    }
    this.references.push(neuron);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      references: this.references.map(ref => ref.toJSON()),
    };
  }
}

module.exports = BookMemoryNeuron;
