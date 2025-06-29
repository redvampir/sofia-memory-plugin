process.env.NO_GIT = "true";
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { updateIndexFile } = require('../tools/simple_index');

(async function run(){
  const tmpDir = path.join(__dirname, 'tmp_index');
  const idxPath = path.join(tmpDir, 'index_lessons.json');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  await updateIndexFile(idxPath, { title: 'Lesson A', file: 'a.md', tags: ['a'], priority: 2 });
  let data = JSON.parse(fs.readFileSync(idxPath, 'utf-8'));
  assert.strictEqual(data.files.length, 1, 'file created');
  assert.strictEqual(data.files[0].title, 'Lesson A');

  await updateIndexFile(idxPath, { title: 'Lesson B', file: 'b.md', tags: [], priority: 1 });
  data = JSON.parse(fs.readFileSync(idxPath, 'utf-8'));
  assert.strictEqual(data.files.length, 2, 'added entry');
  assert.strictEqual(data.files[0].file, 'b.md', 'sorted by priority');

  await updateIndexFile(idxPath, { title: 'Lesson B updated', file: 'b.md', tags: ['x'], priority: 3 });
  data = JSON.parse(fs.readFileSync(idxPath, 'utf-8'));
  assert.strictEqual(data.files.length, 2, 'no duplicates');
  const b = data.files.find(e => e.file === 'b.md');
  assert.strictEqual(b.title, 'Lesson B updated', 'updated title');
  assert.deepStrictEqual(b.tags, ['x']);
  assert.strictEqual(b.priority, 3);

  const priorities = data.files.map(e => e.priority);
  const sorted = [...priorities].sort((a,b)=>(a??Infinity)-(b??Infinity));
  assert.deepStrictEqual(priorities, sorted, 'sorted by priority');

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('index_utils tests passed');
})();
