
const fs = require('fs');
const path = require('path');

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

exports.saveMemory = (req, res) => {
  const { repo, token, filename, content } = req.body;
  console.log('[saveMemory]', new Date().toISOString(), repo, filename);

  if (!repo || !token || !filename || !content) {
    return res.status(400).json({ status: 'error', message: 'Missing required fields.' });
  }

  const filePath = path.join(__dirname, 'memory', filename);
  ensureDir(filePath);
  fs.writeFileSync(filePath, content, 'utf-8');

  res.json({ status: 'success', action: 'saveMemory', filePath });
};

exports.readMemory = (req, res) => {
  const { repo, token, filename } = req.body;
  console.log('[readMemory]', new Date().toISOString(), repo, filename);

  const filePath = path.join(__dirname, 'memory', filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ status: 'error', message: 'File not found.' });
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  res.json({ status: 'success', action: 'readMemory', content });
};

exports.getMemoryList = (req, res) => {
  const base = path.join(__dirname, 'memory');
  const files = [];

  function scan(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) scan(fullPath);
      else files.push(path.relative(base, fullPath));
    }
  }

  scan(base);
  res.json({ status: 'success', files });
};

exports.setMemoryRepo = (req, res) => {
  const { userId, repoUrl } = req.body;
  console.log('[setMemoryRepo]', userId, repoUrl);
  res.json({ status: 'success', repo: repoUrl });
};

exports.saveLessonPlan = (req, res) => {
  const { planData } = req.body;
  console.log('[saveLessonPlan]', new Date().toISOString());
  res.json({ status: 'success', action: 'saveLessonPlan' });
};

exports.saveNote = (req, res) => {
  const { note } = req.body;
  console.log('[saveNote]', new Date().toISOString());
  res.json({ status: 'success', action: 'saveNote' });
};

exports.getContextSnapshot = (req, res) => {
  console.log('[getContextSnapshot]', new Date().toISOString());
  res.json({ status: 'success', context: {} });
};

exports.createUserProfile = (req, res) => {
  const { user } = req.body;
  console.log('[createUserProfile]', user);
  res.json({ status: 'success', action: 'createUserProfile' });
};
