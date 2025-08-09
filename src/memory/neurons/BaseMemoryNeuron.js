class BaseMemoryNeuron {
  extract(text) {
    throw new Error('extract() must be implemented by subclasses');
  }

  toJSON() {
    return { type: this.constructor.name };
  }
}

module.exports = BaseMemoryNeuron;
