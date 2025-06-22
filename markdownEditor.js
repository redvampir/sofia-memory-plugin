const fs = require('fs');
const path = require('path');
const validator = require('./markdownValidator');

function createBackup(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const { dir, name, ext } = path.parse(filePath);
  const currentContent = fs.readFileSync(filePath, 'utf-8');

  const regex = new RegExp(`^${name}_backup_\\d{8}_\\d{6}\\${ext}$`);
  const backups = fs
    .readdirSync(dir)
    .filter(f => regex.test(f))
    .sort();
  if (backups.length) {
    const last = backups[backups.length - 1];
    try {
      const lastContent = fs.readFileSync(path.join(dir, last), 'utf-8');
      if (lastContent === currentContent) return null;
    } catch (e) {
      // ignore
    }
  }

  const ts = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '_')
    .split('.')[0];
  const backupName = `${name}_backup_${ts}${ext}`;
  const backupPath = path.join(dir, backupName);
  fs.copyFileSync(filePath, backupPath);

  console.log(`🔐 Backup created: ${path.relative(process.cwd(), backupPath)}`);
  try {
    const { execSync } = require('child_process');
    execSync(`git ls-files --error-unmatch ${filePath}`, { stdio: 'ignore' });
    console.log(`[createBackup] git-tracked: ${filePath}`);
  } catch (_) {
    // not a git repo or file is untracked
  }

  return backupPath;
}


function markChecklistItem(filePath, heading, itemText, checked = true) {
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

  createBackup(filePath);
  lines[idx] = `- [${checked ? 'x' : ' '}] ${itemText}`;
  fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
  return true;
}

function insertSection(filePath, heading, contentLines) {
  validator.checkFileExists(filePath);
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split(/\r?\n/);
  validator.validateMarkdownSyntax(lines, filePath);

  let hIdx = validator.findHeadingIndex(lines, heading);
  if (hIdx === -1) {
    createBackup(filePath);
    lines.push(`## ${heading}`);
    lines.push(...contentLines);
    fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
    return true;
  }

  let idx = hIdx + 1;
  while (idx < lines.length && !/^#/.test(lines[idx])) idx++;
  createBackup(filePath);
  lines.splice(idx, 0, ...contentLines);
  fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
  return true;
}

function updateMarkdownFile({ filePath, startMarker, endMarker, newContent, strictMode = true }) {
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
  validator.validateMarkdownSyntax(finalLines, filePath);

  createBackup(filePath);
  fs.writeFileSync(filePath, finalLines.join('\n'), 'utf-8');
  return true;
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
  checkDistance = 5
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
    const start = Math.max(0, anchorIdx - checkDistance);
    const end = Math.min(lines.length, anchorIdx + checkDistance);
    const area = lines.slice(start, end).join('\n');
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

  createBackup(filePath);
  fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
  return true;
}

function deduplicateMarkdown({
  filePath,
  heading,
  startMarker,
  endMarker,
  mode = 'keep-first'
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
    createBackup(filePath);
    fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
    return true;
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
