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

function mergeTaskLines(existingLines = [], newLines = []) {
  const normalize = line =>
    String(line)
      .replace(/^\s*[-*]\s+\[[ xX]\]\s*/, '')
      .replace(/\s+/g, '')
      .toLowerCase();

  const parse = line => {
    const m = String(line).match(/^\s*([-*])\s+\[([ xX])\]\s*(.*)$/);
    if (!m) return null;
    return { bullet: m[1], checked: m[2].toLowerCase() === 'x', text: m[3] };
  };

  const map = new Map();
  const order = [];

  for (const line of existingLines) {
    const info = parse(line);
    if (!info) continue;
    const key = normalize(line);
    map.set(key, info);
    order.push(key);
  }

  for (const line of newLines) {
    const info = parse(line);
    if (!info) continue;
    const key = normalize(line);
    if (map.has(key)) {
      const prev = map.get(key);
      prev.checked = info.checked;
      map.set(key, prev);
    } else {
      map.set(key, info);
      order.push(key);
    }
  }

  return order.map(key => {
    const { bullet, checked, text } = map.get(key);
    return `${bullet} [${checked ? 'x' : ' '}] ${text}`;
  });
}

function slugify(text = '') {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function generateMarkdownTOC(markdownText = '', headingLevels = [2, 3]) {
  const lines = String(markdownText).split(/\r?\n/);
  const levels = new Set(headingLevels.map(l => Number(l)));
  const headings = [];
  for (const line of lines) {
    const m = line.match(/^(#{1,6})\s+(.*)$/);
    if (!m) continue;
    const lvl = m[1].length;
    if (lvl === 1) continue;
    if (!levels.has(lvl)) continue;
    const title = m[2].trim();
    headings.push({ title, anchor: `#${slugify(title)}` });
  }
  if (!headings.length) return '';
  const tocLines = ['## Оглавление', ''];
  headings.forEach(h => {
    tocLines.push(`- [${h.title}](${h.anchor})`);
  });
  return tocLines.join('\n');
}

async function insertTOCInMarkdownFile(
  filePath,
  { useTOCAnchor = true, headingLevels = [2, 3] } = {}
) {
  const fs = require('fs');

  if (!fs.existsSync(filePath)) return false;
  const original = fs.readFileSync(filePath, 'utf-8');

  const toc = generateMarkdownTOC(original, headingLevels);
  if (!toc) return false;

  const anchorTag = '<!-- TOC -->';
  let updated = original;

  if (useTOCAnchor && original.includes(anchorTag)) {
    updated = original.replace(anchorTag, toc);
  } else {
    const lines = original.split(/\r?\n/);
    let start = lines.findIndex(l => l.trim().toLowerCase() === '## оглавление');
    if (start !== -1) {
      let end = start + 1;
      while (end < lines.length && !/^#/u.test(lines[end])) end++;
      lines.splice(start, end - start, ...toc.split(/\r?\n/));
      updated = lines.join('\n');
    } else {
      let insertPos = 0;
      for (let i = 0; i < lines.length; i++) {
        if (/^#\s+/.test(lines[i])) {
          insertPos = i + 1;
          break;
        }
      }
      while (insertPos < lines.length && lines[insertPos].trim() === '') {
        insertPos++;
      }
      const tocArr = toc.split(/\r?\n/);
      lines.splice(insertPos, 0, ...tocArr, '');
      updated = lines.join('\n');
    }
  }

  if (updated === original) return false;
  fs.writeFileSync(filePath, updated, 'utf-8');
  return true;
}

async function safeUpdateMarkdownChecklist(filePath, tag, newTasks = []) {
  const fs = require('fs');
  const path = require('path');

  let text = '';
  if (fs.existsSync(filePath)) {
    text = fs.readFileSync(filePath, 'utf-8');
  } else {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }

  const sections = parseMarkdownSections(text);
  const block = sections.find(b => b.type === 'anchor' && b.tag === tag);

  let existing = [];
  if (block) {
    existing = block.content.split(/\r?\n/).slice(1, -1);
  }

  const merged = mergeTaskLines(existing, newTasks);

  const updated = updateMarkdownBlock(text, tag, merged.join('\n'));
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

async function splitMarkdownFile(
  filePath,
  { maxLines = 100, maxChars = 8000, splitBy = '##', outputDir = 'memory/' } = {}
) {
  const fs = require('fs');
  const path = require('path');

  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, 'utf-8');
  const lines = String(text).split(/\r?\n/);
  const base = path.basename(filePath, '.md');

  const ensureDir = dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  };

  const splitByHeader = (arr, level) => {
    const parts = [];
    const regex = new RegExp(`^${'#'.repeat(level)}\\s+(.*)`);
    let current = [];
    let title = '';
    arr.forEach(line => {
      const m = line.match(regex);
      if (m) {
        if (current.length) parts.push({ title, lines: current });
        current = [line];
        title = m[1].trim();
      } else {
        current.push(line);
      }
    });
    if (current.length) parts.push({ title, lines: current });
    return parts;
  };

  const splitByTag = arr => {
    const parts = [];
    let current = [];
    let title = '';
    let tag = null;
    for (let i = 0; i < arr.length; i++) {
      const line = arr[i];
      const start = line.match(/<!--\s*START:\s*(.+?)\s*-->/i);
      if (start) {
        if (current.length) parts.push({ title, lines: current });
        current = [line];
        tag = start[1].trim();
        title = tag;
        continue;
      }
      const end = line.match(/<!--\s*END:\s*(.+?)\s*-->/i);
      current.push(line);
      if (end && tag && end[1].trim() === tag) {
        parts.push({ title, lines: current });
        current = [];
        title = '';
        tag = null;
      }
    }
    if (current.length) parts.push({ title, lines: current });
    return parts;
  };

  const processParts = (parts, method) => {
    const results = [];
    for (const part of parts) {
      const text = part.lines.join('\n');
      if (part.lines.length > maxLines || text.length > maxChars) {
        let next = null;
        if (method === '##') next = splitByHeader(part.lines, 3);
        else if (method === 'tag') next = splitByHeader(part.lines, 2);
        if (next && next.length > 1) {
          results.push(...processParts(next, method === 'tag' ? '##' : '###'));
        } else {
          for (let i = 0; i < part.lines.length; i += maxLines) {
            results.push({
              title: part.title,
              lines: part.lines.slice(i, i + maxLines),
            });
          }
        }
      } else {
        results.push(part);
      }
    }
    return results;
  };

  let initial;
  if (splitBy === 'tag') initial = splitByTag(lines);
  else if (splitBy === '###') initial = splitByHeader(lines, 3);
  else initial = splitByHeader(lines, 2);

  const finalParts = processParts(initial, splitBy);

  ensureDir(outputDir);
  const index = { parts: [] };
  finalParts.forEach((p, idx) => {
    const fname = `${base}_part_${idx + 1}.md`;
    fs.writeFileSync(path.join(outputDir, fname), p.lines.join('\n'), 'utf-8');
    index.parts.push({ title: p.title || `Part ${idx + 1}`, file: fname });
  });

  const indexPath = path.join(outputDir, `index_split_${base}.json`);
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
  return index.parts.map(p => p.file);
}

module.exports = {
  parseFrontMatter,
  parseAutoIndex,
  parseMarkdownSections,
  updateMarkdownBlock,
  deduplicateTasks,
  mergeTaskLines,
  generateMarkdownTOC,
  insertTOCInMarkdownFile,
  safeUpdateMarkdownChecklist,
  ensureMarkdownBlock,
  splitMarkdownFile,
};
