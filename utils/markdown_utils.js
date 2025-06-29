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

module.exports = {
  parseFrontMatter,
  parseAutoIndex,
  parseMarkdownSections,
};
