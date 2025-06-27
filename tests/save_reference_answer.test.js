process.env.NO_GIT = "true";
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { saveReferenceAnswer } = require('../src/memory');
const { parse_save_reference_answer } = require('../utils/helpers');

(async function run(){
  const cmd = 'Сохрани это как эталонный ответ vector_basics';
  const parsed = parse_save_reference_answer(cmd);
  assert.strictEqual(parsed.key, 'vector_basics');

  const rel = 'memory/answers/vector_basics.md';
  await saveReferenceAnswer(null, null, 'vector_basics', 'Answer');
  const abs = path.join(__dirname, '..', rel);
  assert.ok(fs.existsSync(abs));
  const data = fs.readFileSync(abs, 'utf-8');
  assert.strictEqual(data, 'Answer');
  fs.unlinkSync(abs);
  console.log('save reference answer test passed');
})();
