const fs = require('fs');
const path = require('path');
const assert = require('assert');

(async () => {
  const cfgPath = path.join(__dirname, '..', '..', 'config', 'config.json');
  const original = fs.readFileSync(cfgPath, 'utf8');
  const cfg = JSON.parse(original);
  cfg.mirrorNeurons = ['StyleMirrorNeuron', 'EmotionMirrorNeuron'];
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));

  try {
    const DraftGenerator = require('../../src/generator/draft/DraftGenerator');
    const generator = new DraftGenerator();
    const result = await generator.generate('I am so happy and excited today!');
    assert(
      result.text.includes('formal sentence') ||
        result.text.includes('informal sentence'),
      'style neuron output missing'
    );
    assert(result.text.includes('😊'), 'emotion neuron output missing');
    console.log('mirror neurons test passed');
  } finally {
    fs.writeFileSync(cfgPath, original);
  }
})();
