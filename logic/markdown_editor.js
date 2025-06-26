const fs = require('fs');
const path = require('path');
const validator = require('./markdown_validator');
const memory_settings = require('../tools/memory_settings');

function count_tokens(text = '') {
  return String(text).split(/\s+/).filter(Boolean).length;
}

function createBackup(filePath) {
  if (!fs.existsSync(filePath)) return null;

  const backupsDir = path.join(__dirname, '..', 'memory', '_backups');
  if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });

  const base = path.basename(filePath);
  const currentContent = fs.readFileSync(filePath, 'utf-8');

  const regex = new RegExp(
    `^${base.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\.bak\.\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}\.md$`
  );
  const backups = fs
    .readdirSync(backupsDir)
    .filter(f => regex.test(f))
    .sort();
  if (backups.length) {
    const last = backups[backups.length - 1];
    try {
      const lastContent = fs.readFileSync(path.join(backupsDir, last), 'utf-8');
      if (lastContent === currentContent) return null;
    } catch (e) {
      // ignore
    }
  }

  const ts = new Date().toISOString().split('.')[0].replace(/:/g, '-');
  const backupName = `${base}.bak.${ts}.md`;
  const backupPath = path.join(backupsDir, backupName);
  fs.copyFileSync(filePath, backupPath);

  const limit = 5;
  if (backups.length >= limit) {
    const toRemove = backups.slice(0, backups.length - limit + 1);
    for (const f of toRemove) {
      try {
        fs.unlinkSync(path.join(backupsDir, f));
      } catch (_) {
        // ignore
      }
    }
  }

  console.log(`🔐 Backup created: ${path.relative(process.cwd(), backupPath)}`);
  return backupPath;
}

function writeLines(filePath, lines, force = false) {
  const check = validator.validateMarkdownSyntax(lines, filePath);
  if (!check.valid) {
    console.error(
      `[writeLines] ${check.message} at line ${check.line} in '${path.basename(filePath)}'`
    );
    if (!force) return false;
  }
  createBackup(filePath);
  const data = Array.isArray(lines) ? lines.join('\n') : lines;
  const tokens = count_tokens(data);
  if (tokens > memory_settings.token_soft_limit && memory_settings.enforce_soft_limit) {
    console.warn('[writeLines] token limit reached', tokens);
    return false;
  }
  fs.writeFileSync(filePath, data, 'utf-8');
  return true;
}


function markChecklistItem(filePath, heading, itemText, checked = true, force = false) {
  validator.checkFileExists(filePath);
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split(/\r?\n/);
  validator.validateMarkdownSyntax(lines, filePath);

  const idx = validator.ensureChecklistItemExists(
    lines,
    heading,
    itemText,
    filePath
  );

  const current = lines[idx];
  if (/^[-*]\s+\[[xX]\]/.test(current) && checked) {
    console.log('ℹ️ Info: Task already marked as complete. No update necessary.');
    return false;
  }

  lines[idx] = `- [${checked ? 'x' : ' '}] ${itemText}`;
  return writeLines(filePath, lines, force);
}

function insertSection(filePath, heading, contentLines, force = false) {
  validator.checkFileExists(filePath);
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split(/\r?\n/);
  validator.validateMarkdownSyntax(lines, filePath);

  let hIdx = validator.findHeadingIndex(lines, heading);
  if (hIdx === -1) {
    lines.push(`## ${heading}`);
    lines.push(...contentLines);
    return writeLines(filePath, lines, force);
  }

  let idx = hIdx + 1;
  while (idx < lines.length && !/^#/.test(lines[idx])) idx++;
  lines.splice(idx, 0, ...contentLines);
  return writeLines(filePath, lines, force);
}

function updateMarkdownFile({ filePath, startMarker, endMarker, newContent, strictMode = true, force = false }) {
  validator.checkFileExists(filePath);
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split(/\r?\n/);
  validator.validateMarkdownSyntax(lines, filePath);

  const startIdx = lines.findIndex(l => l.includes(startMarker));
  const endIdx = lines.findIndex((l, i) => i > startIdx && l.includes(endMarker));

  if (startIdx === -1 || endIdx === -1) {
    if (strictMode) {
      throw new Error(`\u274c Error: Markers not found in '${path.basename(filePath)}'`);
    }
    return false;
  }

  const before = lines.slice(0, startIdx + 1);
  const after = lines.slice(endIdx);
  const newLines = Array.isArray(newContent) ? newContent : newContent.split(/\r?\n/);
  const finalLines = before.concat(newLines, after);
  return writeLines(filePath, finalLines, force);
}

function insertAtAnchor({
  filePath,
  content,
  heading,
  level,
  tag,
  occurrence = 1,
  position = 'after',
  skipIfExists = false,
  prepend = false,
  append = false,
  checkDistance = Infinity,
  force = false
}) {
  validator.checkFileExists(filePath);
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split(/\r?\n/);
  validator.validateMarkdownSyntax(lines, filePath);

  const newLines = Array.isArray(content) ? content : content.split(/\r?\n/);

  let anchorIdx = -1;
  let count = 0;

  if (tag) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(tag)) {
        count++;
        if (count === occurrence) {
          anchorIdx = i;
          break;
        }
      }
    }
  } else {
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^(#{1,6})\s+(.*)$/);
      if (m) {
        const lvl = m[1].length;
        const text = m[2].trim();
        if ((level === undefined || lvl === level) && (!heading || text === heading)) {
          count++;
          if (count === occurrence) {
            anchorIdx = i;
            break;
          }
        }
      }
    }
  }

  if (anchorIdx === -1) {
    throw new Error(`\u274c Error: Anchor not found in '${path.basename(filePath)}'`);
  }

  if (skipIfExists) {
    let area;
    if (Number.isFinite(checkDistance)) {
      const start = Math.max(0, anchorIdx - checkDistance);
      const end = Math.min(lines.length, anchorIdx + checkDistance);
      area = lines.slice(start, end).join('\n');
    } else {
      area = lines.join('\n');
    }
    if (area.includes(newLines.join('\n'))) {
      return false;
    }
  }

  let insertIdx = position === 'before' ? anchorIdx : anchorIdx + 1;

  if (append || prepend) {
    const targetIdx = position === 'before' ? anchorIdx - 1 : anchorIdx;
    if (targetIdx < 0 || targetIdx >= lines.length) {
      append = prepend = false;
    } else {
      const text = Array.isArray(content) ? content.join('') : content;
      const sep = lines[targetIdx].endsWith(' ') || text.startsWith(' ') ? '' : ' ';
      if (append) lines[targetIdx] = lines[targetIdx] + sep + text;
      else lines[targetIdx] = text + sep + lines[targetIdx];
    }
  }

  if (!append && !prepend) {
    const toInsert = [...newLines];
    if (insertIdx > 0 && lines[insertIdx - 1].trim() !== '' && toInsert[0].trim() !== '') {
      toInsert.unshift('');
    }
    if (insertIdx < lines.length && lines[insertIdx].trim() !== '' && toInsert[toInsert.length - 1].trim() !== '') {
      toInsert.push('');
    }
    lines.splice(insertIdx, 0, ...toInsert);
  }

  return writeLines(filePath, lines, force);
}

function deduplicateMarkdown({
  filePath,
  heading,
  startMarker,
  endMarker,
  mode = 'keep-first',
  force = false
}) {
  validator.checkFileExists(filePath);
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split(/\r?\n/);
  validator.validateMarkdownSyntax(lines, filePath);

  let start = 0;
  let end = lines.length;

  if (heading) {
    const idx = lines.findIndex(l => {
      const m = l.match(/^(#{1,6})\s+(.*)$/);
      return m && m[2].trim() === heading;
    });
    if (idx >= 0) {
      start = idx + 1;
      const level = (lines[idx].match(/^(#{1,6})/)[1] || '#').length;
      for (let i = start; i < lines.length; i++) {
        const m = lines[i].match(/^(#{1,6})\s+/);
        if (m && m[1].length <= level) {
          end = i;
          break;
        }
      }
    }
  }

  if (startMarker) {
    const i = lines.findIndex(l => l.includes(startMarker));
    if (i >= 0) start = Math.max(start, i + 1);
  }
  if (endMarker) {
    const i = lines.findIndex((l, idx) => idx > start && l.includes(endMarker));
    if (i >= 0) end = Math.min(end, i);
  }

  const map = new Map();
  const toRemove = [];

  const normalize = txt =>
    txt
      .toLowerCase()
      .replace(/[.,!?;:]+/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  for (let i = start; i < end; i++) {
    const orig = lines[i];
    const t = orig.trim();
    if (!t) continue;
    const headingMatch = t.match(/^#{1,6}\s+(.*)$/);
    let text = t;
    if (headingMatch) text = headingMatch[1];
    else if (/^[-*+]\s+\[[ xX]\]\s+/.test(t)) {
      text = t.replace(/^[-*+]\s+\[[ xX]\]\s+/, '');
    } else if (/^[-*+]\s+/.test(t)) {
      text = t.replace(/^[-*+]\s+/, '');
    } else if (/^\d+\.\s+/.test(t)) {
      text = t.replace(/^\d+\.\s+/, '');
    }
    const key = normalize(text);
    if (map.has(key)) {
      const prevIdx = map.get(key);
      if (mode === 'keep-last') {
        toRemove.push(prevIdx);
        map.set(key, i);
      } else {
        toRemove.push(i);
      }
    } else {
      map.set(key, i);
    }
  }

  if (toRemove.length) {
    toRemove.sort((a, b) => b - a).forEach(idx => lines.splice(idx, 1));
    return writeLines(filePath, lines, force);
  }
  return false;
}

module.exports = {
  createBackup,
  markChecklistItem,
  insertSection,
  updateMarkdownFile,
  insertAtAnchor,
  deduplicateMarkdown
};
