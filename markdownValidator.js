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
  const lines = Array.isArray(content) ? content : String(content).split(/\r?\n/);
  if (lines.length === 1 && lines[0].trim() === '') {
    console.warn('⚠️ Warning: File exists but is empty. No content to validate.');
    return { valid: true };
  }

  let codeFence = 0;
  let prevIndent = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();

    if (/^```/.test(t)) {
      codeFence++;
    }

    if (/^#+/.test(t) && !/^#{1,6}\s+\S/.test(t)) {
      return { valid: false, line: i + 1, message: 'Invalid header format' };
    }

    if (/^[-*]\s*\[/.test(t) && !/^[-*]\s+\[[ xX]\]\s+.+/.test(t)) {
      return { valid: false, line: i + 1, message: 'Malformed checklist item' };
    }

    if (/^\s*[-*]/.test(line)) {
      const indent = line.match(/^(\s*)[-*]/)[1].length;
      if (indent % 2 !== 0 || Math.abs(indent - prevIndent) > 2) {
        return { valid: false, line: i + 1, message: 'Inconsistent list indentation' };
      }
      prevIndent = indent;
    } else if (t !== '') {
      prevIndent = 0;
    }
  }

  if (codeFence % 2 !== 0) {
    return { valid: false, line: lines.length, message: 'Unclosed code block' };
  }

  return { valid: true };
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
