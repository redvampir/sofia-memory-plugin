require('dotenv').config();

const express = require('express');
const fs = require('fs');
const path = require('path');
const systemRoutes = require('./api/system');

const app = express();

app.use(express.json({ limit: '10mb' }));

// === Маршрут ping (без авторизации) ===
app.get('/ping', (_req, res) => {
  res.json({ ok: true, message: 'pong' });
});

// === Middleware авторизации ===
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    if (!process.env.GITHUB_TOKEN) {
      return res.status(401).json({ error: 'Unauthorized: invalid GitHub token' });
    }
  }
  next();
});

// === Маршрут ping под /api для обратной совместимости ===
app.get('/api/ping', (_req, res) => {
  res.json({ ok: true, message: 'pong' });
});

app.use(systemRoutes);

// === Маршрут saveMemory ===
app.post('/api/saveMemory', (req, res) => {
  const { fileName = 'memory.json', content } = req.body || {};

  if (content === undefined) {
    return res.status(400).json({ status: 'error', error: 'Content is required' });
  }

  try {
    const dir = path.resolve('./memory_files');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const safeName = path.basename(fileName);
    const filePath = path.join(dir, safeName);
    const payload = typeof content === 'string' ? content : JSON.stringify(content, null, 2);

    fs.writeFileSync(filePath, payload, 'utf8');

    res.json({ status: 'success', file: safeName });
  } catch (err) {
    console.error('[saveMemory] Ошибка при записи файла', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// === Запуск сервера ===
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`sofia-memory API running on port ${PORT}`));

module.exports = app;
