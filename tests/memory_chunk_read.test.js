const fs = require('fs');
const path = require('path');
const assert = require('assert');

process.env.NO_INDEX_UPDATE = 'true';

const { saveContentWithSplitting, resolveMemoryReadTarget } = require('../logic/memory_operations');
const { normalize_memory_path } = require('../tools/file_utils');

async function readSlice({ normalizedFilename, offset, limit, fullBuffer }) {
  const selection = await resolveMemoryReadTarget({ normalizedFilename, offset, limit });
  const targetPath = path.join(__dirname, '..', selection.target);
  const data = fs.readFileSync(targetPath);
  const partSlice = data.subarray(selection.range.start, selection.range.end + 1).toString();
  const expectedLength = selection.range.end - selection.range.start + 1;
  const expected = fullBuffer
    .subarray(offset, Math.min(offset + expectedLength, fullBuffer.length))
    .toString();
  assert.strictEqual(partSlice, expected, `slice mismatch at offset ${offset}`);
  assert.ok(selection.part >= 1 && selection.part <= selection.parts, 'invalid part index');
  return selection;
}

async function run() {
  const rel = 'memory/tmp_read/big_file.txt';
  const normalized = normalize_memory_path(rel);
  const abs = path.join(__dirname, '..', normalized);
  fs.mkdirSync(path.dirname(abs), { recursive: true });

  const fragment = '0123456789abcdef';
  const content = Array.from({ length: 200 }, (_, i) => `${fragment}-${i}`)
    .join('\n')
    .repeat(2);
  const fullBuffer = Buffer.from(content);

  await saveContentWithSplitting({ filePath: abs, content, maxFileSize: 128, autoSplit: true });

  await readSlice({ normalizedFilename: normalized, offset: 0, limit: 64, fullBuffer });
  await readSlice({
    normalizedFilename: normalized,
    offset: Math.floor(fullBuffer.length / 2),
    limit: 64,
    fullBuffer,
  });
  await readSlice({
    normalizedFilename: normalized,
    offset: Math.max(fullBuffer.length - 80, 0),
    limit: 128,
    fullBuffer,
  });

  const selection = await resolveMemoryReadTarget({ normalizedFilename: normalized, offset: 0, limit: 32 });
  const brokenPath = path.join(__dirname, '..', selection.target);
  fs.unlinkSync(brokenPath);
  let missing = false;
  try {
    await resolveMemoryReadTarget({ normalizedFilename: normalized, offset: 0, limit: 32 });
  } catch (e) {
    missing = true;
    assert.strictEqual(e.status, 404);
  }
  assert.ok(missing, 'ожидалась ошибка при отсутствии части');

  fs.rmSync(path.join(__dirname, '..', 'memory', 'tmp_read'), { recursive: true, force: true });
  console.log('memory_chunk_read tests passed');
}

run();
