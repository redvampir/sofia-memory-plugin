const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { MAX_INDEX_FILE_SIZE } = require('../utils/file_splitter');

async function checkAndSplitIndex(indexPath, maxSize = MAX_INDEX_FILE_SIZE) {
  try {
    const stats = await fsp.stat(indexPath);
    if (stats.size <= maxSize) return;
    await splitIndexFile(indexPath, maxSize);
  } catch {
    // ignore missing file
  }
}

async function splitIndexFile(indexPath, maxSize = MAX_INDEX_FILE_SIZE) {
  try {
    await fsp.access(indexPath);
  } catch {
    return;
  }
  const raw = await fsp.readFile(indexPath, 'utf-8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error('[index_splitter] invalid JSON', e.message);
    return;
  }
  if (!Array.isArray(data.files)) return;

  const dir = path.dirname(indexPath);
  const base = path.basename(indexPath, '.json');

  const parts = [];
  let current = [];

  const flush = () => {
    if (!current.length) return;
    parts.push(current);
    current = [];
  };

  for (const entry of data.files) {
    current.push(entry);
    const temp = JSON.stringify({ ...data, files: current });
    if (Buffer.byteLength(temp, 'utf-8') > maxSize && current.length > 1) {
      current.pop();
      flush();
      current.push(entry);
    }
  }
  flush();

  for (const [idx, files] of parts.entries()) {
    const outPath = idx === 0 ? indexPath : path.join(dir, `${base}.part${idx + 1}.json`);
    await fsp.writeFile(outPath, JSON.stringify({ ...data, files }, null, 2), 'utf-8');
  }

  // remove old extra parts
  let n = parts.length + 1;
  while (true) {
    const extra = path.join(dir, `${base}.part${n}.json`);
    try {
      await fsp.unlink(extra);
      n++;
    } catch {
      break;
    }
  }

  if (parts.length > 1) {
    console.log(`[index_splitter] split ${indexPath} into ${parts.length} parts`);
  }
}

module.exports = { checkAndSplitIndex, splitIndexFile };
