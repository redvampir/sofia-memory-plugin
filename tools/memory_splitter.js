const fs = require('fs');
const path = require('path');
const index_manager = require('../logic/index_manager');
const { ensure_dir, normalize_memory_path } = require('./file_utils');

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
  const total_tokens = count_tokens(original);
  if (total_tokens <= max_tokens) return [normalized];

  const dir = abs.replace(/\.md$/i, '');
  ensure_dir(dir);
  const rel_dir = normalized.replace(/\.md$/i, '');

  const blocks = split_into_blocks(original);
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
    if (buf.length && tok + t > max_tokens) flush();
    buf.push(b);
    tok += t;
  });
  flush();

  parts.forEach((p, idx) => {
    const part_path = path.join(dir, `part${idx + 1}.md`);
    fs.writeFileSync(part_path, p + '\n', 'utf-8');
  });

  const title_match = original.match(/^#\s*(.+)/);
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

  fs.unlinkSync(abs);

  const new_rel = path.posix.join(rel_dir, 'index.md');
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
