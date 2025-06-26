const fs = require('fs');
const path = require('path');

const indexSettings = {
  validate_on_load: true,
  auto_clean_invalid: true,
  auto_clean_missing: false,
  require_manual_meta: true,
  block_plugin_paths: true,
  max_index_size: 100 * 1024,
};

function normalize(p) {
  return p.replace(/\\+/g, '/');
}

function isUserMemoryPath(p) {
  const norm = path.posix.normalize(p);
  if (!norm.startsWith('memory/')) return false;
  if (norm.includes('..')) return false;
  return true;
}

function validateEntry(entry) {
  const p = normalize(entry.path || entry.file || '');
  const result = { path: p, status: 'valid', entry };
  if (!isUserMemoryPath(p)) {
    result.status = 'invalid';
    result.reason = 'outside memory';
    return result;
  }
  if (indexSettings.block_plugin_paths && p.includes('sofia-memory-plugin')) {
    result.status = 'invalid';
    result.reason = 'plugin path';
    return result;
  }
  const abs = path.join(__dirname, '..', p);
  if (!fs.existsSync(abs)) {
    result.status = 'missing';
    result.reason = 'missing file';
  }
  return result;
}

function validateIndex(entries) {
  const report = { valid: [], missing: [], invalid: [] };
  const cleaned = [];
  entries.forEach(e => {
    const check = validateEntry(e);
    if (check.status === 'valid') {
      cleaned.push(e);
      report.valid.push(check.path);
    } else if (check.status === 'missing') {
      if (!indexSettings.auto_clean_missing || e.pinned) {
        cleaned.push(e);
      }
      report.missing.push(check.path);
    } else if (check.status === 'invalid') {
      if (!indexSettings.auto_clean_invalid || e.pinned) {
        cleaned.push(e);
      }
      report.invalid.push(check.path);
    }
  });
  return { entries: cleaned, report };
}

module.exports = { indexSettings, validateEntry, validateIndex };
