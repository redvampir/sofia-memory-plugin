// Файловые утилиты и функции обработки путей
const fs = require('fs');
const path = require('path');
const { detect_markdown_category } = require('../logic/markdown_category');

function ensure_dir(p) {
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

function normalize_memory_path(p) {
  if (!p) return 'memory/';
  let rel = p.replace(/\\+/g, '/');
  rel = path.posix.normalize(rel).replace(/^(\.\/)+/, '').replace(/^\/+/, '');
  // FIXME: '..' segments remain after normalization, allowing paths outside
  // the memory directory. Remove '..' parts to prevent traversal.
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
  if (p.endsWith('.md')) return detect_markdown_category(p);
  if (p.includes('plan')) return 'plan';
  if (p.includes('profile')) return 'profile';
  if (p.includes('lesson')) return 'lesson';
  if (p.includes('answers') || p.includes('answer')) return 'answer';
  if (p.includes('note')) return 'note';
  return 'file';
}

module.exports = {
  ensure_dir,
  deepMerge,
  normalize_memory_path,
  generateTitleFromPath,
  inferTypeFromPath,
};
