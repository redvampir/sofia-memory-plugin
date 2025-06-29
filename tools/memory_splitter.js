const fs = require('fs');
const path = require('path');
const index_manager = require('../logic/index_manager');
const { ensure_dir, normalize_memory_path } = require('./file_utils');

const MIN_TOKENS = 30; // minimum tokens per part to avoid tiny fragments

function count_tokens(text = '') {
  return String(text).split(/\s+/).filter(Boolean).length;
}

function split_into_blocks(md) {
  const lines = md.split(/\r?\n/);
  const has_anchor = lines.some(l => /<!--\s*START:/i.test(l));
  if (!has_anchor) {
    return md
      .split(/\n{2,}/)
      .map(p => p.trim())
      .filter(Boolean);
  }
  const blocks = [];
  let current = [];
  for (const line of lines) {
    if (/<!--\s*START:/i.test(line) && current.length) {
      blocks.push(current.join('\n'));
      current = [];
    }
    current.push(line);
    if (/<!--\s*END:/i.test(line)) {
      blocks.push(current.join('\n'));
      current = [];
    }
  }
  if (current.length) blocks.push(current.join('\n'));
  return blocks;
}

async function split_memory_file(filename, max_tokens) {
  const normalized = normalize_memory_path(filename);
  const abs = path.join(__dirname, '..', normalized);
  if (!fs.existsSync(abs)) throw new Error('File not found');
  const original = fs.readFileSync(abs, 'utf-8');
  let content = original;
  if (original.startsWith('---')) {
    const end = original.indexOf('---', 3);
    if (end !== -1) content = original.slice(end + 3).trim();
  }
  const backupPath = `${abs}.bak`;
  try {
    fs.copyFileSync(abs, backupPath);
  } catch (_) {
    // ignore backup errors
  }

  const is_index = path.basename(normalized).toLowerCase() === 'index.md';
  let existingParts = null;
  if (is_index) {
    const fm = original.match(/^---\n([\s\S]*?)\n---/);
    if (fm) {
      const m = fm[1].match(/parts:\s*\[([^\]]+)\]/);
      if (m) {
        existingParts = m[1]
          .split(',')
          .map(p => p.trim().replace(/^['"]|['"]$/g, ''))
          .filter(Boolean);
      }
    }
  }

  if (existingParts) {
    const out = existingParts.map(p =>
      path.posix.join(path.posix.dirname(normalized), p)
    );
    if (!process.env.NO_INDEX_UPDATE) {
      await index_manager.addOrUpdateEntry({
        path: normalized,
        title: index_manager.generateTitleFromPath(normalized),
        type: index_manager.inferTypeFromPath(normalized),
        lastModified: new Date().toISOString(),
      });
      await index_manager.saveIndex();
    }
    return out;
  }

  const total_tokens = count_tokens(content);
  if (total_tokens <= max_tokens) return [normalized];

  const dir = is_index ? path.dirname(abs) : abs.replace(/\.md$/i, '');
  ensure_dir(dir);
  const rel_dir = is_index
    ? path.posix.dirname(normalized)
    : normalized.replace(/\.md$/i, '');

  const blocks = split_into_blocks(content);
  const parts = [];
  let buf = [];
  let tok = 0;
  const flush = () => {
    if (!buf.length) return;
    parts.push(buf.join('\n\n').trim());
    buf = [];
    tok = 0;
  };
  blocks.forEach(b => {
    const t = count_tokens(b);
    if (buf.length && tok + t > max_tokens) {
      if (tok >= MIN_TOKENS) flush();
    }
    buf.push(b);
    tok += t;
  });
  flush();

  const MAX_PARTS = 10;
  if (parts.length > MAX_PARTS) {
    console.warn(`[SPLIT] \u0421\u043b\u0438\u0448\u043a\u043e\u043c \u043c\u043d\u043e\u0433\u043e \u0447\u0430\u0441\u0442\u0435\u0439 (${parts.length}), \u0441\u043e\u043a\u0440\u0430\u0442\u0438\u043c.`);
    parts.length = MAX_PARTS;
  }

  parts.forEach((p, idx) => {
    const part_path = path.join(dir, `part${idx + 1}.md`);
    const meta = [
      '---',
      `part_index: ${idx + 1}`,
      'tag: split-part',
      '---',
      ''
    ].join('\n');
    fs.writeFileSync(part_path, meta + p + '\n', 'utf-8');
  });

  const title_match = content.match(/^#\s*(.+)/);
  const title = title_match ? title_match[1].trim() : path.basename(filename, '.md');
  const meta_lines = [
    '---',
    `title: ${title}`,
    `parts: [${parts.map((_, i) => `part${i + 1}.md`).join(', ')}]`,
    `tokens_total: ${total_tokens}`,
    'split: auto',
    `updated: ${new Date().toISOString().slice(0, 10)}`,
    '---',
    ''
  ];
  fs.writeFileSync(path.join(dir, 'index.md'), meta_lines.join('\n'), 'utf-8');

  if (!is_index) fs.unlinkSync(abs);

  const new_rel = is_index
    ? normalized
    : path.posix.join(rel_dir, 'index.md');
  if (!process.env.NO_INDEX_UPDATE) {
    await index_manager.removeEntry(normalized);
    await index_manager.addOrUpdateEntry({
      path: new_rel,
      title: index_manager.generateTitleFromPath(new_rel),
      type: index_manager.inferTypeFromPath(new_rel),
      lastModified: new Date().toISOString(),
    });
    await index_manager.saveIndex();
  }
  return parts.map((_, i) => path.posix.join(rel_dir, `part${i + 1}.md`));
}

module.exports = { split_memory_file };
