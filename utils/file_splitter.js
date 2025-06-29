const fs = require('fs');
const path = require('path');
const { parseMarkdownStructure, serializeMarkdownTree } = require('../logic/markdown_merge_engine.ts');

// Константы для максимального размера файлов
// Увеличенные лимиты для хранимых и записываемых файлов
const MAX_MD_FILE_SIZE = 5 * 1024 * 1024;  // 5 MB для Markdown файлов
const MAX_INDEX_FILE_SIZE = 3 * 1024 * 1024;  // 3 MB для файлов путей или индексов

/**
 * Split a file into parts if it exceeds provided size limit.
 * @param {string} filePath
 * @param {number} maxSize
 * @returns {string[]} array of part file paths
 */
function splitFile(filePath, maxSize) {
  const stats = fs.statSync(filePath);
  if (stats.size <= maxSize) {
    return [filePath];
  }

  const fileExtension = path.extname(filePath);
  const fileName = path.basename(filePath, fileExtension);
  const directory = path.dirname(filePath);

  const buffer = fs.readFileSync(filePath);
  const parts = [];
  let partNum = 1;
  for (let offset = 0; offset < buffer.length; offset += maxSize) {
    const slice = buffer.slice(offset, offset + maxSize);
    const partPath = path.join(directory, `${fileName}_part${partNum}${fileExtension}`);
    fs.writeFileSync(partPath, slice);
    parts.push(partPath);
    partNum++;
  }

  return parts;
}

/**
 * Split a markdown file into parts respecting MAX_MD_FILE_SIZE.
 * Each part is parsed and serialized to preserve structure.
 * @param {string} filePath
 * @param {number} [maxSize=MAX_MD_FILE_SIZE]
 * @returns {string[]} array of part file paths
 */
function splitMarkdownFile(filePath, maxSize = MAX_MD_FILE_SIZE) {
  const partPaths = splitFile(filePath, maxSize);
  partPaths.forEach(p => {
    const raw = fs.readFileSync(p, 'utf-8');
    const tree = parseMarkdownStructure(raw);
    const out = serializeMarkdownTree(tree);
    fs.writeFileSync(p, out, 'utf-8');
  });
  return partPaths;
}

/**
 * Split index data into chunks respecting size limit.
 * @param {object} indexData
 * @param {number} [maxSize=MAX_INDEX_FILE_SIZE]
 * @returns {object[]}
 */
function splitIndexData(indexData, maxSize = MAX_INDEX_FILE_SIZE) {
  if (!Array.isArray(indexData.files)) return [indexData];

  const parts = [];
  let current = [];

  const flush = () => {
    if (!current.length) return;
    parts.push({ ...indexData, files: current });
    current = [];
  };

  indexData.files.forEach(entry => {
    current.push(entry);
    const tmp = JSON.stringify({ ...indexData, files: current });
    if (Buffer.byteLength(tmp, 'utf-8') > maxSize && current.length > 1) {
      current.pop();
      flush();
      current.push(entry);
    }
  });
  flush();
  return parts;
}

/**
 * Split an index file into multiple files if needed.
 * Each part is written next to the original with .partN suffix.
 * @param {string} indexPath
 * @param {number} [maxSize=MAX_INDEX_FILE_SIZE]
 * @returns {string[]} paths to part files
 */
function splitIndexFile(indexPath, maxSize = MAX_INDEX_FILE_SIZE) {
  const stats = fs.statSync(indexPath);
  if (stats.size <= maxSize) return [indexPath];

  const raw = fs.readFileSync(indexPath, 'utf-8');
  const data = JSON.parse(raw);
  const dir = path.dirname(indexPath);
  const base = path.basename(indexPath, '.json');

  const partsData = splitIndexData(data, maxSize);
  const outPaths = [];
  partsData.forEach((part, idx) => {
    const p = idx === 0 ? indexPath : path.join(dir, `${base}.part${idx + 1}.json`);
    fs.writeFileSync(p, JSON.stringify(part, null, 2), 'utf-8');
    outPaths.push(p);
  });

  let n = partsData.length + 1;
  while (true) {
    const extra = path.join(dir, `${base}.part${n}.json`);
    if (fs.existsSync(extra)) {
      fs.unlinkSync(extra);
      n++;
    } else {
      break;
    }
  }

  return outPaths;
}

module.exports = {
  MAX_MD_FILE_SIZE,
  MAX_INDEX_FILE_SIZE,
  splitFile,
  splitMarkdownFile,
  splitIndexData,
  splitIndexFile,
};
