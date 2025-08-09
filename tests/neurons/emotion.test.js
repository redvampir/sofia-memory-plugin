const assert = require('assert');
const EmotionMirrorNeuron = require('../../src/generator/neurons/EmotionMirrorNeuron');

function run() {
  const happyNeuron = new EmotionMirrorNeuron();
  const happyStyle = happyNeuron.analyze('I am so happy and excited today!');
  assert.strictEqual(happyStyle.emotion, 'happy');
  const happyGenerated = happyNeuron.generate({ text: 'hello' });
  assert.ok(happyGenerated.includes('😊'), 'Happy emoji missing');

  const sadNeuron = new EmotionMirrorNeuron();
  const sadStyle = sadNeuron.analyze('This is a sad and depressing moment.');
  assert.strictEqual(sadStyle.emotion, 'sad');
  const sadGenerated = sadNeuron.generate({ text: 'hello' });
  assert.ok(sadGenerated.includes('😢'), 'Sad emoji missing');

  console.log('EmotionMirrorNeuron tests passed');
}

run();
