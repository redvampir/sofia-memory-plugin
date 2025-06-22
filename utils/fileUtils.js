const fs = require('fs');
const path = require('path');
const { detectMarkdownCategory } = require('../markdownCategory');

function ensureDir(p) {
  const dir = path.extname(p) ? path.dirname(p) : p;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function isObject(val) {
  return val && typeof val === 'object' && !Array.isArray(val);
}

function deepMerge(target, source, matchKey) {
  if (Array.isArray(target) && Array.isArray(source)) {
    const result = [...target];
    source.forEach(item => {
      if (matchKey && isObject(item)) {
        const idx = result.findIndex(e => isObject(e) && e[matchKey] === item[matchKey]);
        if (idx >= 0) {
          result[idx] = deepMerge(result[idx], item, matchKey);
        } else {
          result.push(item);
        }
      } else if (!result.includes(item)) {
        result.push(item);
      }
    });
    return result;
  } else if (isObject(target) && isObject(source)) {
    const out = { ...target };
    Object.keys(source).forEach(key => {
      if (key in target) {
        out[key] = deepMerge(target[key], source[key], matchKey);
      } else {
        out[key] = source[key];
      }
    });
    return out;
  }
  return source;
}

function normalizeMemoryPath(p) {
  if (!p) return 'memory/';
  let rel = p.replace(/\\+/g, '/');
  rel = path.posix.normalize(rel).replace(/^(\.\/)+/, '').replace(/^\/+/, '');
  while (rel.startsWith('memory/')) {
    rel = rel.slice('memory/'.length);
  }
  return path.posix.join('memory', rel);
}

function generateTitleFromPath(p) {
  return p
    .split('/')
    .pop()
    .replace(/\..+$/, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());
}

function inferTypeFromPath(p) {
  if (p.endsWith('.md')) return detectMarkdownCategory(p);
  if (p.includes('plan')) return 'plan';
  if (p.includes('profile')) return 'profile';
  if (p.includes('lesson')) return 'lesson';
  if (p.includes('note')) return 'note';
  return 'file';
}

module.exports = {
  ensureDir,
  deepMerge,
  normalizeMemoryPath,
  generateTitleFromPath,
  inferTypeFromPath,
};
