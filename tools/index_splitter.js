const fs = require('fs');
const path = require('path');

function checkAndSplitIndex(indexPath, maxSize = 100 * 1024) {
  if (!fs.existsSync(indexPath)) return;
  const stats = fs.statSync(indexPath);
  if (stats.size <= maxSize) return;
  splitIndexFile(indexPath, maxSize);
}

function splitIndexFile(indexPath, maxSize = 100 * 1024) {
  if (!fs.existsSync(indexPath)) return;
  const raw = fs.readFileSync(indexPath, 'utf-8');
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

  parts.forEach((files, idx) => {
    const outPath = idx === 0 ? indexPath : path.join(dir, `${base}.part${idx + 1}.json`);
    fs.writeFileSync(outPath, JSON.stringify({ ...data, files }, null, 2), 'utf-8');
  });

  // remove old extra parts
  let n = parts.length + 1;
  while (true) {
    const extra = path.join(dir, `${base}.part${n}.json`);
    if (fs.existsSync(extra)) {
      fs.unlinkSync(extra);
      n++;
    } else {
      break;
    }
  }

  if (parts.length > 1) {
    console.log(`[index_splitter] split ${indexPath} into ${parts.length} parts`);
  }
}

module.exports = { checkAndSplitIndex, splitIndexFile };
