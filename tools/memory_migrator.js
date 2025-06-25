const fs = require('fs');
const path = require('path');
const index_manager = require('../logic/index_manager');
const { normalize_memory_path, generateTitleFromPath, inferTypeFromPath } = require('./file_utils');

const LATEST_VERSION = '1.2';

function parse_front_matter(text = '') {
  if (!text.startsWith('---')) return { meta: {}, body: text };
  const end = text.indexOf('\n---', 3);
  if (end < 0) return { meta: {}, body: text };
  const header = text.slice(3, end).trim();
  const body = text.slice(end + 4);
  const meta = {};
  header.split(/\r?\n/).forEach(line => {
    const parts = line.split(':');
    const key = parts.shift().trim();
    meta[key] = parts.join(':').trim();
  });
  return { meta, body };
}

function build_front_matter(meta) {
  const lines = ['---'];
  Object.keys(meta).forEach(k => {
    lines.push(`${k}: ${meta[k]}`);
  });
  lines.push('---', '');
  return lines.join('\n');
}

function ensure_anchors(text) {
  if (/<!--\s*START:/i.test(text)) return text.trim();
  return ['<!-- START: content -->', text.trim(), '<!-- END: content -->'].join('\n');
}

function normalize_headings(text) {
  return text
    .replace(/\r/g, '')
    .split(/\n/)
    .map(l => l.replace(/^(#+)([^#\s])/ , '$1 $2').replace(/\s+$/,''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

async function migrateMemoryFile(filename) {
  const normalized = normalize_memory_path(filename);
  const abs = path.join(__dirname, '..', normalized);
  if (!fs.existsSync(abs)) throw new Error('File not found');
  const raw = fs.readFileSync(abs, 'utf-8');
  const { meta, body } = parse_front_matter(raw);
  const current_version = meta.version || null;
  if (current_version && parseFloat(current_version) >= parseFloat(LATEST_VERSION)) {
    return normalized;
  }
  const title = meta.title || generateTitleFromPath(normalized);
  let content = body || raw;
  content = normalize_headings(content);
  content = ensure_anchors(content);

  const new_meta = {
    title,
    version: LATEST_VERSION,
    updated: new Date().toISOString().slice(0,10),
    tags: meta.tags || '[]',
    migrated: true,
  };
  const updated = build_front_matter(new_meta) + content + '\n';
  fs.writeFileSync(abs, updated, 'utf-8');

  if (!process.env.NO_INDEX_UPDATE) {
    await index_manager.addOrUpdateEntry({
      path: normalized,
      title,
      type: inferTypeFromPath(normalized),
      tags: [],
    });
    await index_manager.saveIndex();
  }
  return normalized;
}

async function migrateAllLegacyFiles(folder) {
  const start = path.join(__dirname, '..', folder || 'memory');
  const tasks = [];
  const scan = dir => {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir, { withFileTypes: true }).forEach(ent => {
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) return scan(abs);
      if (!ent.name.endsWith('.md')) return;
      const rel = path.relative(path.join(__dirname, '..'), abs).replace(/\\/g, '/');
      tasks.push(migrateMemoryFile(rel).catch(() => null));
    });
  };
  scan(start);
  const results = await Promise.all(tasks);
  return results.filter(Boolean);
}

module.exports = {
  migrateMemoryFile,
  migrateAllLegacyFiles,
};
