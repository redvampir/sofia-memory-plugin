const fs = require('fs');
const path = require('path');
const { sanitizeIndex, readIndexSafe, listMemoryFiles, fileExistsInRepo } = require('../logic/memory_operations');
const { normalize_memory_path } = require('./file_utils');

async function loadIndex() {
  try {
    return await sanitizeIndex(readIndexSafe());
  } catch {
    return [];
  }
}

function matchQuery(entry, query, regex) {
  const p = (entry.path || '').toLowerCase();
  const t = (entry.title || '').toLowerCase();
  if (regex) return regex.test(p) || regex.test(t);
  const q = query.toLowerCase();
  return p === q || t === q || p.includes(q) || t.includes(q) ||
    p.startsWith(q) || p.endsWith(q) || t.startsWith(q) || t.endsWith(q);
}

async function searchIndex(query) {
  const idx = await loadIndex();
  const regex = query.startsWith('/') && query.endsWith('/') ? new RegExp(query.slice(1, -1), 'i') : null;
  const matches = idx.filter(e => matchQuery(e, query, regex));
  return matches.map(e => e.path);
}

async function searchFiles(query) {
  const files = await listMemoryFiles(null, null, 'memory');
  const regex = query.startsWith('/') && query.endsWith('/') ? new RegExp(query.slice(1, -1), 'i') : null;
  const q = query.toLowerCase();
  const matches = files.filter(f => {
    const p = f.toLowerCase();
    if (regex) return regex.test(p);
    return p === q || p.includes(q) || p.startsWith(q) || p.endsWith(q);
  });
  return matches;
}

async function resolveMarkdownPath(query, opts = {}) {
  if (!query) return null;
  let candidate = query;
  if (candidate.startsWith('memory/')) {
    const abs = path.join(__dirname, '..', candidate);
    if (fs.existsSync(abs)) return candidate;
  }

  let matches = await searchIndex(candidate);
  if (!matches.length) {
    matches = await searchFiles(candidate);
  }
  const unique = Array.from(new Set(matches));
  if (unique.length === 1) {
    const p = normalize_memory_path(unique[0]);
    const existsRemote = await fileExistsInRepo(opts.repo, opts.token, p);
    if (!existsRemote) throw new Error('File not found in repo');
    return p;
  }
  if (unique.length > 1) {
    return { multiple: unique };
  }
  return null;
}

module.exports = { resolveMarkdownPath };
