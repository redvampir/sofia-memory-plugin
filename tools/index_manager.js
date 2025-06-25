const { sort_by_priority } = require('./index_utils');
const index_tree = require('./index_tree');


function loadIndex() {
  try {
    return sort_by_priority(index_tree.listAllEntries());
  } catch {
    return [];
  }
}

function saveIndex(_data) {
  // deprecated: indexes are saved via logic/index_manager
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

function filterByStatus(status) {
  return loadIndex().filter(e => e.status === status);
}

function filterByTags(tags) {
  const arr = Array.isArray(tags) ? tags : [tags];
  return loadIndex().filter(
    e => Array.isArray(e.tags) && arr.every(t => e.tags.includes(t))
  );
}

function filterByDate(field, days) {
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  return loadIndex().filter(e => {
    const ts = Date.parse(e[field]);
    return !isNaN(ts) && ts >= since;
  });
}

function filterByCategory(category) {
  return loadIndex().filter(e => e.category === category);
}

function searchByKeyword(query) {
  const re = new RegExp(query, 'i');
  return loadIndex().filter(e => {
    const fields = [e.title, e.summary];
    if (Array.isArray(e.tags)) fields.push(...e.tags);
    return fields.some(v => v && re.test(String(v)));
  });
}

function getContextFilesForKeywords(keywords = []) {
  let entries = loadIndex();
  if (keywords.length) {
    const reList = keywords.map(k => new RegExp(k, 'i'));
    entries = entries.filter(e => {
      const fields = [e.title, e.summary];
      if (Array.isArray(e.tags)) fields.push(...e.tags);
      return reList.some(r => fields.some(v => v && r.test(String(v))));
    });
  }
  return sort_by_priority(entries)
    .filter(e => e && e.path)
    .map(e => e.path);
}

function sortIndexByPriority() {
  const sorted = sort_by_priority(loadIndex());
  saveIndex(sorted);
  return sorted;
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
  filterByStatus,
  filterByTags,
  filterByDate,
  filterByCategory,
  searchByKeyword,
  getNextLesson,
  getContextFilesForKeywords,
  sortIndexByPriority,
  updateMetadata,
  validatePath,
};
