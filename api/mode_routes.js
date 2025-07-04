const express = require('express');
const router = express.Router();
const {
  getMemoryModeSync,
  setMemoryMode,
} = require('../src/memory_mode');
const { setLocalPath } = require('../utils/memory_mode');

router.get('/memory-mode', (req, res) => {
  const mode = getMemoryModeSync();
  res.json({ mode });
});

router.post('/memory-mode', async (req, res) => {
  const { mode } = req.body || {};
  const val = (mode || '').toLowerCase();
  if (!['local', 'github'].includes(val)) {
    return res.status(400).json({ status: 'error', message: 'Invalid mode' });
  }
  await setMemoryMode(val);
  res.json({ status: 'success', mode: val });
});

router.post('/local-path', async (req, res) => {
  const { path, userId } = req.body || {};
  if (!path) {
    return res.status(400).json({ status: 'error', message: 'Missing path' });
  }
  try {
    await setLocalPath(userId || 'default', path);
    res.json({ status: 'success', path });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

module.exports = router;
