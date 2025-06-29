const fs = require('fs');
const path = require('path');

// Константы для максимального размера файлов
const MAX_MD_FILE_SIZE = 500 * 1024;  // 500 KB для Markdown файлов
const MAX_INDEX_FILE_SIZE = 500 * 1024;  // 500 KB для файлов путей или индексов

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

module.exports = { MAX_MD_FILE_SIZE, MAX_INDEX_FILE_SIZE, splitFile };
