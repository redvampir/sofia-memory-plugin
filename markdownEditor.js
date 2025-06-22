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

module.exports = {
  createBackup,
  markChecklistItem,
  insertSection
};
