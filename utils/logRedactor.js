const SENSITIVE_PATTERNS = [
  /\bghp_[A-Za-z0-9]{20,}\b/g, // GitHub classic tokens
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, // GitHub fine-grained tokens
  /\b[A-Za-z0-9_-]{32,}\b/g, // generic long tokens
];

function redactString(value) {
  if (!value) return value;
  return SENSITIVE_PATTERNS.reduce((acc, pattern) => acc.replace(pattern, '***'), value);
}

function redactValue(value) {
  if (typeof value === 'string') {
    return redactString(value);
  }
  if (Array.isArray(value)) {
    return value.map(item => redactValue(item));
  }
  if (value && typeof value === 'object') {
    return Object.keys(value).reduce((acc, key) => {
      acc[key] = redactValue(value[key]);
      return acc;
    }, Array.isArray(value) ? [] : {});
  }
  return value;
}

function redact(value) {
  try {
    return redactValue(value);
  } catch (e) {
    return '***';
  }
}

module.exports = { redact };
