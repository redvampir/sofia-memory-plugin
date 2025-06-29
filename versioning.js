const instructions = require('./logic/instructions_manager');
const fs = require('fs');
const path = require('path');

const logsDir = path.join(__dirname, 'logs');
const summaryFile = path.join(logsDir, 'summary.log');

function appendSummaryLog(line) {
  fs.mkdirSync(logsDir, { recursive: true });
  fs.appendFileSync(summaryFile, line + '\n');
}

exports.commit_instructions = async (req, res) => {
  try {
    const { version = 'base', content } = req.body || {};
    if (!content) throw new Error('Missing content');
    await instructions.edit(version, content);
    console.log('[Versioning] commit', version);
    appendSummaryLog(`[Versioning] commit ${version}`);
    res.json({ status: 'success', version });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
};

exports.rollback_instructions = async (req, res) => {
  try {
    const { version = 'base', historyFile } = req.body || {};
    const file = historyFile || instructions.listHistory(version).slice(-1)[0];
    if (!file) throw new Error('No history found');
    await instructions.rollback(version, file);
    console.log('[Versioning] rollback', { version, file });
    appendSummaryLog(`[Versioning] rollback ${version} -> ${file}`);
    res.json({ status: 'success', restored: file });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
};

exports.list_versions = (req, res) => {
  const { version = 'base' } = req.body || {};
  res.json({
    status: 'success',
    current: instructions.getCurrentVersion(),
    history: instructions.listHistory(version)
  });
};
