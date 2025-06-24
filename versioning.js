const instructions = require('./logic/instructions_manager');

exports.commit_instructions = async (req, res) => {
  try {
    const { version = 'base', content } = req.body || {};
    if (!content) throw new Error('Missing content');
    await instructions.edit(version, content);
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
