const fs = require('fs');
const path = require('path');
const { findMatchingFile } = require('../tools/index_utils');

function loadIndex(indexPath) {
  const abs = path.join(__dirname, '..', indexPath);
  if (!fs.existsSync(abs)) return null;
  try {
    const raw = fs.readFileSync(abs, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function chooseLesson(keyword, indexPath = 'memory/lessons/index.json') {
  const data = loadIndex(indexPath);
  if (!data) return null;
  const matches = findMatchingFile(data, keyword);
  return matches[0] || null;
}

module.exports = { loadIndex, chooseLesson };
