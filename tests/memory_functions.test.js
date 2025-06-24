process.env.NO_GIT = "true";
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { readMemory, saveMemory, refreshContextFromMemoryFiles, setMemoryRepo } = require('../memory');
const token_store = require('../tools/token_store');
const memory_config = require('../tools/memory_config');

// ensure no remote repo/token to avoid network operations
setMemoryRepo(null, null);

async function run() {
  const index_raw = await readMemory(null, null, 'memory/index.json');
  const index = JSON.parse(index_raw);
  assert.ok(Array.isArray(index));
  console.log('readMemory json ok');

  const lesson_raw = await readMemory(null, null, 'memory/lessons/04_example.md');
  assert.ok(lesson_raw.includes('Example Lesson'));
  console.log('readMemory md ok');

  const tmp_dir = path.join(__dirname, 'tmp_memory');
  if (!fs.existsSync(tmp_dir)) fs.mkdirSync(tmp_dir);
  const md_rel = 'memory/tmp_memory/test_note.md';
  await saveMemory(null, null, md_rel, 'Hello');
  const md_path = path.join(__dirname, '..', md_rel);
  assert.strictEqual(fs.readFileSync(md_path, 'utf-8'), 'Hello');
  const md_read = await readMemory(null, null, md_rel);
  assert.strictEqual(md_read, 'Hello');
  console.log('saveMemory and readMemory md ok');

  const json_rel = 'memory/tmp_memory/data.json';
  await saveMemory(null, null, json_rel, JSON.stringify({ a: 1 }));
  const json_path = path.join(__dirname, '..', json_rel);
  const json_read = await readMemory(null, null, json_rel);
  assert.strictEqual(json_read, JSON.stringify({ a: 1 }));
  console.log('saveMemory and readMemory json ok');

  let failed = false;
  try {
    await readMemory(null, null, 'memory/tmp_memory/no_file.txt');
  } catch (e) {
    failed = true;
    assert.ok(e.message.includes('not found'));
  }
  assert.ok(failed);
  console.log('error handling ok');

  const lesson_rel = 'memory/lessons/04_example.md';
  const lesson_path = path.join(__dirname, '..', lesson_rel);
  const original_lesson = fs.readFileSync(lesson_path, 'utf-8');
  const updated_lesson = original_lesson + '\nUpdate A';
  await saveMemory(null, null, lesson_rel, updated_lesson);
  const ctx1 = await refreshContextFromMemoryFiles();
  assert.ok(ctx1.currentLesson && ctx1.currentLesson.includes('Update A'));
  console.log('refreshContext after lesson update ok');

  const checklist_rel = 'memory/plan_checklist.md';
  const checklist_path = path.join(__dirname, '..', checklist_rel);
  const original_checklist = fs.readFileSync(checklist_path, 'utf-8');
  const new_checklist = original_checklist + '\n- [ ] New Item';
  await saveMemory(null, null, checklist_rel, new_checklist);
  const check_content = await readMemory(null, null, checklist_rel);
  assert.ok(check_content.includes('New Item'));
  console.log('checklist append ok');

  const edited_lesson = updated_lesson.replace('Update A', 'Edit B');
  await saveMemory(null, null, lesson_rel, edited_lesson);
  const lesson_read = await readMemory(null, null, lesson_rel);
  assert.ok(lesson_read.includes('Edit B'));
  console.log('lesson edit ok');

  setMemoryRepo('tok', 'repo');
  assert.strictEqual(token_store.getToken(null), 'tok');
  assert.strictEqual(memory_config.getRepoUrl(null), 'repo');
  console.log('setMemoryRepo ok');

  // disable network writes for cleanup
  setMemoryRepo(null, null);

  await saveMemory(null, null, lesson_rel, original_lesson);
  await saveMemory(null, null, checklist_rel, original_checklist);
  fs.rmSync(path.join(__dirname, '..', 'memory/tmp_memory'), { recursive: true, force: true });

  // final cleanup
  setMemoryRepo(null, null);

  console.log('memory functions tests passed');
}

run();
