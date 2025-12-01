process.env.NO_GIT = 'true';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { saveContentWithSplitting } = require('../logic/memory_operations');

const tmpRoot = path.join(__dirname, '..', 'memory', 'tmp_split_tests');
const targetFile = path.join(tmpRoot, 'notes', 'sample.txt');
const targetDir = path.dirname(targetFile);
const indexPath = path.join(targetDir, 'memory_index.json');

function resetTmp() {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });
}

function writeIndex(entry) {
  fs.writeFileSync(indexPath, JSON.stringify([entry], null, 2), 'utf-8');
}

const relOriginal = 'memory/tmp_split_tests/notes/sample.txt';
const relPart1 = 'memory/tmp_split_tests/notes/sample_part1.txt';
const relPart2 = 'memory/tmp_split_tests/notes/sample_part2.txt';

async function testCleanupAfterSingleSave() {
  resetTmp();
  const part1 = path.join(targetDir, 'sample_part1.txt');
  const part2 = path.join(targetDir, 'sample_part2.txt');
  fs.writeFileSync(part1, 'old-part-1');
  fs.writeFileSync(part2, 'old-part-2');
  writeIndex({
    originalFile: relOriginal,
    parts: [relPart1, relPart2],
  });

  await saveContentWithSplitting({
    filePath: targetFile,
    content: 'short content',
    maxFileSize: 50,
    autoSplit: true,
  });

  assert.ok(fs.existsSync(targetFile), 'основной файл должен существовать');
  assert.strictEqual(fs.readFileSync(targetFile, 'utf-8'), 'short content');
  assert.ok(!fs.existsSync(part1) && !fs.existsSync(part2), 'старые части должны быть удалены');

  const parsed = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  assert.deepStrictEqual(parsed, [], 'индекс должен очиститься после снятия разбиения');
}

async function testStalePartsRemovedOnResplit() {
  resetTmp();
  const part1 = path.join(targetDir, 'sample_part1.txt');
  const part2 = path.join(targetDir, 'sample_part2.txt');
  const part3 = path.join(targetDir, 'sample_part3.txt');
  const extraPart = path.join(targetDir, 'sample_part4.txt');
  fs.writeFileSync(part1, 'old-1');
  fs.writeFileSync(part2, 'old-2');
  fs.writeFileSync(part3, 'old-3');
  fs.writeFileSync(extraPart, 'stale');
  writeIndex({
    originalFile: relOriginal,
    parts: [
      relPart1,
      relPart2,
      'memory/tmp_split_tests/notes/sample_part3.txt',
      'memory/tmp_split_tests/notes/sample_part4.txt',
    ],
  });

  const res = await saveContentWithSplitting({
    filePath: targetFile,
    content: 'A'.repeat(11),
    maxFileSize: 5,
    autoSplit: true,
  });

  assert.ok(Array.isArray(res.parts) && res.parts.length === 3, 'должно остаться 3 части');
  assert.ok(!fs.existsSync(extraPart), 'лишняя часть должна быть удалена');
  const parsed = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  assert.strictEqual(parsed.length, 1, 'индекс должен содержать запись для файла');
  assert.deepStrictEqual(parsed[0].parts, res.parts, 'индекс должен соответствовать новым частям');
}

async function run() {
  try {
    await testCleanupAfterSingleSave();
    await testStalePartsRemovedOnResplit();
    console.log('memory split cleanup tests passed');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

run();
