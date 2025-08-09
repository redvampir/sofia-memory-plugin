const fs = require('fs');
const path = require('path');
const StyleMirrorNeuron = require('./StyleMirrorNeuron');
const EmotionMirrorNeuron = require('./EmotionMirrorNeuron');
const StructureMirrorNeuron = require('./StructureMirrorNeuron');

/**
 * Create mirror neuron states from book text and persist them.
 * @param {string} bookId - Identifier for the book.
 * @param {string} text - Text content to analyze.
 * @returns {Object} Object containing state from each mirror neuron.
 */
function createFromText(bookId, text = '') {
  const styleNeuron = new StyleMirrorNeuron();
  const emotionNeuron = new EmotionMirrorNeuron();
  const structureNeuron = new StructureMirrorNeuron();

  const style = styleNeuron.analyze(text);
  const emotion = emotionNeuron.analyze(text);
  const structure = structureNeuron.analyze(text);

  const state = { style, emotion, structure };

  const dataDir = path.resolve(__dirname, '../../../data/mirror-neurons');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const filePath = path.join(dataDir, `${bookId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf8');

  return state;
}

module.exports = { createFromText };
