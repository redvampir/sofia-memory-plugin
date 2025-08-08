const fs = require('fs');
const path = require('path');
const { touchIndexEntry } = require('../tools/context_priority');

class RegenerateSession {
  constructor(originalAnswer = '', opts = {}) {
    this.originalAnswer = originalAnswer;
    this.variants = [];
    this.attempts = 0;
    this.maxAttempts = opts.maxAttempts || 3;
    this.logPath = opts.logPath || path.join(__dirname, '..', 'memory', 'regenerate.log');
  }

  remaining() {
    return this.maxAttempts - this.attempts;
  }

  isLimitReached() {
    return this.attempts >= this.maxAttempts;
  }

  recordAttempt(prompt, answer, fragments = []) {
    this.variants.push({ prompt, answer, fragments });
    this.attempts += 1;
    this.currentAnswer = answer;
  }

  accept() {
    const final = this.currentAnswer || this.originalAnswer;
    if (!final) return null;
    try {
      fs.mkdirSync(path.dirname(this.logPath), { recursive: true });
      fs.appendFileSync(this.logPath, final + '\n');
    } catch {}
    const fragments = (this.variants[this.variants.length - 1] || {}).fragments || [];
    fragments.forEach(f => touchIndexEntry(f));
    this.reset();
    return final;
  }

  cancel() {
    this.reset();
  }

  reset() {
    this.originalAnswer = '';
    this.variants = [];
    this.attempts = 0;
    this.currentAnswer = null;
  }
}

module.exports = { RegenerateSession };
