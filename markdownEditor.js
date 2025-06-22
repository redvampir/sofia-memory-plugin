const fs = require('fs');
const path = require('path');

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function createBackup(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const { dir, name, ext } = path.parse(filePath);
  const ts = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '_')
    .split('.')[0];
  const backupName = `${name}_backup_${ts}${ext}`;
  const backupPath = path.join(dir, backupName);
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

function findHeadingIndex(lines, heading) {
  const regex = new RegExp(`^#{1,6}\\s+${escapeRegExp(heading)}\\s*$`, 'i');
  return lines.findIndex(l => regex.test(l.trim()));
}

function markChecklistItem(filePath, heading, itemText, checked = true) {
  if (!fs.existsSync(filePath)) {
    console.warn(`[markdownEditor] file not found: ${filePath}`);
    return false;
  }
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split(/\r?\n/);
  createBackup(filePath);

  let hIdx = findHeadingIndex(lines, heading);
  if (hIdx === -1) {
    lines.push(`## ${heading}`);
    lines.push('');
    hIdx = lines.length - 2;
  }

  let idx = hIdx + 1;
  while (idx < lines.length && !/^#/.test(lines[idx])) {
    const m = lines[idx].match(/^[-*]\s+\[([ xX])\]\s+(.*)$/);
    if (m && m[2].trim() === itemText) {
      lines[idx] = `- [${checked ? 'x' : ' '}] ${itemText}`;
      fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
      return true;
    }
    idx++;
  }

  lines.splice(idx, 0, `- [${checked ? 'x' : ' '}] ${itemText}`);
  fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
  return true;
}

function insertSection(filePath, heading, contentLines) {
  if (!fs.existsSync(filePath)) {
    console.warn(`[markdownEditor] file not found: ${filePath}`);
    return false;
  }
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split(/\r?\n/);
  createBackup(filePath);

  let hIdx = findHeadingIndex(lines, heading);
  if (hIdx === -1) {
    lines.push(`## ${heading}`);
    lines.push(...contentLines);
    fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
    return true;
  }

  let idx = hIdx + 1;
  while (idx < lines.length && !/^#/.test(lines[idx])) idx++;
  lines.splice(idx, 0, ...contentLines);
  fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
  return true;
}

module.exports = {
  createBackup,
  markChecklistItem,
  insertSection
};
