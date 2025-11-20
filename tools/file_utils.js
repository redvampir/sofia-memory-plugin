// Файловые утилиты и функции обработки путей
const fs = require('fs');
const path = require('path');
const { detect_markdown_category } = require('../logic/markdown_category');

/**
 * Ensure directory exists, create if not
 * @param {string} p - Directory or file path
 */
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

/**
 * Normalize memory path to ensure it's within memory/ directory
 * @param {string} p - Path to normalize
 * @returns {string} Normalized path within memory/
 */
function normalizeMemoryPath(p) {
  if (!p) return 'memory/';
  let rel = p.replace(/\\+/g, '/');
  rel = path.posix
    .normalize(rel)
    .replace(/^(\.\/)+/, '')
    .replace(/^\/+/, '');

  // Remove any leading memory/ segments so the path is relative to the root
  // memory directory. This allows idempotent calls with already-normalized paths.
  while (rel.startsWith('memory/')) {
    rel = rel.slice('memory/'.length);
  }

  // Strip any '..' parts to ensure the final path cannot escape the memory dir
  const segments = [];
  for (const part of rel.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (segments.length) segments.pop();
      continue;
    }
    segments.push(part);
  }
  const cleaned = segments.join('/');

  // Join with the memory root. Result is guaranteed to be within memory/.
  return cleaned ? `memory/${cleaned}` : 'memory/';
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
  // New camelCase names
  ensureDir,
  deepMerge,
  normalizeMemoryPath,
  generateTitleFromPath,
  inferTypeFromPath,

  // Backward compatibility (deprecated)
  ensure_dir: ensureDir,
  normalize_memory_path: normalizeMemoryPath,
};
