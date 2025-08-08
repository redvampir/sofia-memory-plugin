const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { ensure_dir, normalize_memory_path } = require('../tools/file_utils');
const { index_to_array, array_to_index } = require('../tools/index_utils');

const indexFile = path.join(__dirname, '..', 'memory', 'index.json');

async function archiveFile(filePath) {
  if (!filePath) return null;
  const normalized = normalize_memory_path(filePath);
  const rel = normalized.replace(/^memory\//, '');
  const archiveRel = path.posix.join('memory', 'archive', rel);
  const src = path.join(__dirname, '..', normalized);
  const dst = path.join(__dirname, '..', archiveRel);
  ensure_dir(dst);
  try {
    await fsp.rename(src, dst);
  } catch (e) {
    // ignore file move errors
  }

  try {
    const raw = await fsp.readFile(indexFile, 'utf-8');
    const arr = index_to_array(JSON.parse(raw));
    const idx = arr.findIndex(e => e.path === normalized);
    if (idx >= 0) {
      arr[idx].archived = true;
      arr[idx].archivePath = archiveRel;
      arr[idx].context_priority = 'low';
      await fsp.writeFile(indexFile, JSON.stringify(array_to_index(arr), null, 2), 'utf-8');
    }
  } catch {
    // ignore index update errors
  }

  return archiveRel;
}

module.exports = { archiveFile };
