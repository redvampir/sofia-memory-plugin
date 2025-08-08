const fs = require('fs');
const path = require('path');

/**
 * SessionSummarizer provides simple summarization and storage utilities
 * for question/answer pairs. Summaries are stored under memory/summaries
 * along with references to full question and answer text files.
 */
class SessionSummarizer {
  constructor(opts = {}) {
    this.memoryRoot = opts.memoryRoot || path.join(__dirname, '..', '..', '..', 'memory');
    this.summaryDir = path.join(this.memoryRoot, 'summaries');
    this.indexPath = path.join(this.summaryDir, 'index.json');
  }

  /**
   * Create a concise summary string for a question/answer pair.
   * @param {string} question
   * @param {string} answer
   * @returns {string}
   */
  summarizePair(question = '', answer = '') {
    const norm = str => String(str).replace(/\s+/g, ' ').trim();
    const q = norm(question).slice(0, 60);
    const a = norm(answer).slice(0, 100);
    const qEllipsis = q.length < norm(question).length ? '...' : '';
    const aEllipsis = a.length < norm(answer).length ? '...' : '';
    return `Q: ${q}${qEllipsis} A: ${a}${aEllipsis}`.trim();
  }

  /**
   * Persist summary and full texts to memory/summaries.
   * Stores full question and answer in separate files and writes
   * an index entry with absolute paths to these sources.
   *
   * @param {string} sessionId
   * @param {string} summary
   * @param {string} fullQuestion
   * @param {string} fullAnswer
   * @returns {{summaryPath: string, questionPath: string, answerPath: string}}
   */
  storeSummary(sessionId, summary, fullQuestion = '', fullAnswer = '') {
    if (!sessionId) throw new Error('sessionId required');
    fs.mkdirSync(this.summaryDir, { recursive: true });

    const questionPath = path.resolve(this.summaryDir, `${sessionId}_question.md`);
    const answerPath = path.resolve(this.summaryDir, `${sessionId}_answer.md`);
    fs.writeFileSync(questionPath, fullQuestion, 'utf-8');
    fs.writeFileSync(answerPath, fullAnswer, 'utf-8');

    const summaryPath = path.resolve(this.summaryDir, `${sessionId}.json`);
    const data = {
      sessionId,
      summary,
      questionPath,
      answerPath,
    };
    fs.writeFileSync(summaryPath, JSON.stringify(data, null, 2));

    // update index
    let indexData;
    if (fs.existsSync(this.indexPath)) {
      try {
        indexData = JSON.parse(fs.readFileSync(this.indexPath, 'utf-8'));
      } catch {
        indexData = null;
      }
    }
    if (!indexData || typeof indexData !== 'object') {
      indexData = { type: 'index-branch', category: 'summaries', files: [] };
    }
    if (!Array.isArray(indexData.files)) indexData.files = [];
    const relSummary = path.relative(this.memoryRoot, summaryPath).replace(/\\/g, '/');
    const entry = { title: summary, file: relSummary };
    const existing = indexData.files.findIndex(f => f.file === relSummary);
    if (existing >= 0) {
      indexData.files[existing] = entry;
    } else {
      indexData.files.push(entry);
    }
    fs.writeFileSync(this.indexPath, JSON.stringify(indexData, null, 2));

    return { summaryPath, questionPath, answerPath };
  }

  /**
   * Retrieve stored summary by session id.
   * @param {string} sessionId
   * @returns {string|null}
   */
  getSummary(sessionId) {
    if (!sessionId) return null;
    const summaryPath = path.join(this.summaryDir, `${sessionId}.json`);
    if (!fs.existsSync(summaryPath)) return null;
    try {
      const data = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
      return data.summary || null;
    } catch {
      return null;
    }
  }

  /**
   * Get full text content by reference path.
   * @param {string} ref - absolute or relative path to stored file
   * @returns {string|null}
   */
  getFullText(ref) {
    if (!ref) return null;
    let p = ref;
    if (!path.isAbsolute(p)) {
      p = path.resolve(this.memoryRoot, ref);
    }
    if (!fs.existsSync(p)) return null;
    return fs.readFileSync(p, 'utf-8');
  }
}

module.exports = SessionSummarizer;

