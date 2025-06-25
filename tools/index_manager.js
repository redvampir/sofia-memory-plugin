const fs = require('fs');
const path = require('path');
const { index_to_array, array_to_index } = require('./index_utils');

const indexFile = path.join(__dirname, '..', 'memory', 'index.json');

function loadIndex() {
  try {
    const raw = fs.readFileSync(indexFile, 'utf-8');
    return index_to_array(JSON.parse(raw));
  } catch {
    return [];
  }
}

function saveIndex(data) {
  try {
    fs.writeFileSync(indexFile, JSON.stringify(array_to_index(data), null, 2), 'utf-8');
  } catch {}
}

function getContextFiles() {
  return loadIndex()
    .filter(e => e && e.context_priority === 'high' && e.path)
    .map(e => e.path);
}

function getLessonByNumber(num) {
  const n = String(parseInt(num, 10)).padStart(2, '0');
  return loadIndex().find(e => e.type === 'lesson' && e.path.includes(n)) || null;
}

function getByPath(p) {
  return loadIndex().find(e => e.path === p) || null;
}

function getByTag(tag) {
  return loadIndex().filter(e => Array.isArray(e.tags) && e.tags.includes(tag));
}

function getNextLesson(num) {
  const current = parseInt(num, 10);
  const lessons = loadIndex()
    .filter(e => e.type === 'lesson')
    .map(e => ({ entry: e, n: parseInt((e.path.match(/(\d+)/) || [])[0], 10) }))
    .sort((a, b) => a.n - b.n);
  for (const { entry, n } of lessons) {
    if (n > current) return entry;
  }
  return null;
}

function updateMetadata(p, field, value) {
  const data = loadIndex();
  const entry = data.find(e => e.path === p);
  if (!entry) return null;
  entry[field] = value;
  saveIndex(data);
  return entry;
}

function validatePath(p) {
  return !!loadIndex().find(e => e.path === p);
}

module.exports = {
  getContextFiles,
  getLessonByNumber,
  getByPath,
  getByTag,
  getNextLesson,
  updateMetadata,
  validatePath,
};
