const s = require('../src/storage');
module.exports = {
  readMemory: s.read_memory,
  saveMemory: s.save_memory,
  saveMemoryWithIndex: s.save_memory_with_index,
  getFile: s.get_file,
  addOrUpdateEntry: s.addOrUpdateEntry,
  saveIndex: s.saveIndex,
};
