const fs = require('fs');
const path = require('path');

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function checkFileExists(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`\u274c Error: File '${filePath}' not found. Update aborted.`);
  }
}

function validateMarkdownSyntax(content, filePath) {
  const lines = Array.isArray(content) ? content : content.split(/\r?\n/);
  let valid = true;
  for (const line of lines) {
    const t = line.trim();
    if (/^#+/.test(t) && !/^#{1,6}\s+\S/.test(t)) {
      valid = false;
      break;
    }
    if (/^[-*]\s*\[/.test(t) && !/^[-*]\s+\[[ xX]\]\s+.+/.test(t)) {
      valid = false;
      break;
    }
  }
  if (!valid) {
    console.warn(`\u26a0\ufe0f Warning: Markdown syntax may be invalid in '${filePath}'`);
  }
  return valid;
}

function findHeadingIndex(lines, heading) {
  const regex = new RegExp(`^#{1,6}\\s+${escapeRegExp(heading)}\\s*$`, 'i');
  return lines.findIndex(l => regex.test(l.trim()));
}

function ensureChecklistItemExists(lines, heading, itemText, filePath) {
  const hIdx = findHeadingIndex(lines, heading);
  if (hIdx === -1) {
    throw new Error(`\u274c Error: Target content not found in '${path.basename(filePath)}'`);
  }
  let idx = hIdx + 1;
  while (idx < lines.length && !/^#/.test(lines[idx])) {
    const m = lines[idx].match(/^[-*]\s+\[[ xX]\]\s+(.*)$/);
    if (m && m[1].trim() === itemText) {
      return idx;
    }
    idx++;
  }
  throw new Error(`\u274c Error: Target content not found in '${path.basename(filePath)}'`);
}

module.exports = {
  checkFileExists,
  validateMarkdownSyntax,
  ensureChecklistItemExists,
  findHeadingIndex
};
