function parseFrontMatter(text = '') {
  if (!text.startsWith('---')) return { meta: {}, body: text };
  const end = text.indexOf('\n---', 3);
  if (end < 0) return { meta: {}, body: text };
  const header = text.slice(3, end).trim();
  const body = text.slice(end + 4);
  const meta = {};
  header.split(/\r?\n/).forEach(line => {
    const parts = line.split(':');
    const key = parts.shift().trim();
    if (key) meta[key] = parts.join(':').trim();
  });
  return { meta, body };
}

function parseAutoIndex(text = '') {
  const { meta } = parseFrontMatter(text);
  if (!meta.files) {
    const lines = text.split(/\r?\n/);
    const idx = lines.findIndex(l => /^files:\s*/i.test(l.trim()));
    if (idx >= 0) {
      const arr = [];
      for (let i = idx + 1; i < lines.length; i++) {
        const ln = lines[i];
        if (/^\s*-\s+/.test(ln)) {
          arr.push(ln.replace(/^\s*-\s+/, '').trim());
        } else if (/^[\w_-]+:\s*/.test(ln.trim())) {
          break;
        }
      }
      if (arr.length) meta.files = arr;
    }
  } else if (typeof meta.files === 'string') {
    meta.files = meta.files
      .replace(/^\[/, '')
      .replace(/\]$/, '')
      .split(/,|\r?\n/)
      .map(t => t.replace(/^\s*-\s*/, '').trim())
      .filter(Boolean);
  }
  return meta;
}

function parseMarkdownSections(fileContent = '') {
  const lines = String(fileContent).split(/\r?\n/);
  const blocks = [];

  const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const header = line.match(/^(#{1,3})\s+(.*)$/);
    if (header) {
      const start = i;
      const title = header[2].trim();
      i++;
      while (i < lines.length) {
        const l = lines[i];
        if (/^(#{1,3})\s+/.test(l) || /<!--\s*START:/i.test(l)) break;
        i++;
      }
      const end = i - 1;
      blocks.push({
        type: 'header',
        title,
        startIndex: start,
        endIndex: end,
        content: lines.slice(start, end + 1).join('\n')
      });
      continue;
    }

    const anchor = line.match(/<!--\s*START:\s*(.+?)\s*-->/i);
    if (anchor) {
      const tag = anchor[1].trim();
      const start = i;
      i++;
      const endRegex = new RegExp(`<!--\\s*END:\\s*${escapeRegExp(tag)}\\s*-->`, 'i');
      while (i < lines.length && !endRegex.test(lines[i])) i++;
      if (i < lines.length) {
        const end = i;
        blocks.push({
          type: 'anchor',
          tag,
          startIndex: start,
          endIndex: end,
          content: lines.slice(start, end + 1).join('\n')
        });
        i++;
      } else {
        blocks.push({
          type: 'anchor',
          tag,
          startIndex: start,
          endIndex: lines.length - 1,
          content: lines.slice(start).join('\n')
        });
        break;
      }
      continue;
    }

    i++;
  }

  return blocks;
}

function updateMarkdownBlock(fileContent = '', tag = '', newContent = '') {
  const startMarker = `<!-- START: ${tag} -->`;
  const endMarker = `<!-- END: ${tag} -->`;
  const startIdx = fileContent.indexOf(startMarker);
  const endIdx = fileContent.indexOf(endMarker);

  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    const trimmed = fileContent.replace(/\s*$/, '');
    const nl = trimmed ? '\n' : '';
    return `${trimmed}${nl}${startMarker}\n${newContent}\n${endMarker}\n`;
  }

  const before = fileContent.slice(0, startIdx + startMarker.length);
  const after = fileContent.slice(endIdx);
  return `${before}\n${newContent}\n${after}`;
}

function deduplicateTasks(existingLines = [], newLines = []) {
  const normalize = line =>
    String(line)
      .replace(/^\s*[-*]\s+\[[ xX]\]\s*/, '')
      .replace(/\s+/g, '')
      .toLowerCase();

  const existingSet = new Set(existingLines.map(normalize));
  return newLines.filter(l => !existingSet.has(normalize(l)));
}

function safeUpdateMarkdownChecklist(filePath, tag, newLines = []) {
  const fs = require('fs');

  const raw = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
  const blocks = parseMarkdownSections(raw);
  const block = blocks.find(b => b.type === 'anchor' && b.tag === tag);

  const normalize = line =>
    String(line)
      .replace(/^\s*[-*]\s+\[[ xX]\]\s*/, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

  const seen = new Set();
  const existing = [];

  if (block) {
    const lines = block.content.split(/\r?\n/).slice(1, -1);
    for (const l of lines) {
      const key = normalize(l);
      if (!seen.has(key)) {
        seen.add(key);
        existing.push(l);
      }
    }
  }

  const added = [];
  for (const l of newLines) {
    const key = normalize(l);
    if (!seen.has(key)) {
      seen.add(key);
      added.push(l);
    }
  }

  if (!added.length && existing.length === (block ? block.content.split(/\r?\n/).length - 2 : 0)) {
    return false;
  }

  const finalLines = existing.concat(added).join('\n');
  const updated = updateMarkdownBlock(raw, tag, finalLines);
  fs.writeFileSync(filePath, updated, 'utf-8');
  return true;
}

function ensureMarkdownBlock(filePath, tag, content = '', opts = {}) {
  const fs = require('fs');
  const raw = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
  const startMarker = `<!-- START: ${tag} -->`;
  const endMarker = `<!-- END: ${tag} -->`;

  if (raw.includes(startMarker) && raw.includes(endMarker)) return false;

  const timestamp = opts.created
    ? opts.created
    : opts.addTimestamp
    ? new Date().toISOString().slice(0, 10)
    : null;
  const lines = [];
  if (content) lines.push(content);
  if (timestamp) lines.push(`<!-- created: ${timestamp} -->`);
  const updated = updateMarkdownBlock(raw, tag, lines.join('\n'));
  fs.writeFileSync(filePath, updated, 'utf-8');
  return true;
}

module.exports = {
  parseFrontMatter,
  parseAutoIndex,
  parseMarkdownSections,
  updateMarkdownBlock,
  deduplicateTasks,
  safeUpdateMarkdownChecklist,
  ensureMarkdownBlock,
};
