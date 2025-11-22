const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;
const storageRoot = path.join(__dirname, 'memory_data');

app.use(cors());
app.use(express.json());
app.use('/.well-known', express.static(path.join(__dirname, '.well-known')));

app.get('/ping', (_req, res) => {
  res.json({ ok: true, message: 'pong' });
});

function resolveFileName(rawName) {
  const safeName = typeof rawName === 'string' && rawName.trim() !== ''
    ? rawName.trim()
    : 'memory.json';

  return path.basename(safeName);
}

app.post('/api/memory/save', (req, res) => {
  const { fileName, content } = req.body || {};
  if (content === undefined) {
    return res.status(400).json({ status: 'error', message: 'Поле content обязательно' });
  }

  const targetName = resolveFileName(fileName);
  const targetPath = path.join(storageRoot, targetName);

  try {
    fs.mkdirSync(storageRoot, { recursive: true });
    const payload = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    fs.writeFileSync(targetPath, payload, 'utf8');
    return res.status(200).json({ status: 'ok', file: targetName });
  } catch (error) {
    console.error('[SAVE] Ошибка записи файла', error);
    return res.status(500).json({ status: 'error', message: 'Не удалось сохранить файл' });
  }
});

app.get('/api/memory/read', (req, res) => {
  const targetName = resolveFileName(req.query.fileName);
  const targetPath = path.join(storageRoot, targetName);

  try {
    if (!fs.existsSync(targetPath)) {
      return res.status(404).json({ status: 'not_found', message: 'Файл не найден' });
    }

    const data = fs.readFileSync(targetPath, 'utf8');
    return res.status(200).json({ status: 'ok', file: targetName, content: data });
  } catch (error) {
    console.error('[READ] Ошибка чтения файла', error);
    return res.status(500).json({ status: 'error', message: 'Не удалось прочитать файл' });
  }
});

app.listen(PORT, () => {
  console.log(`[START] Сервер запущен на порту ${PORT}`);
});

module.exports = app;
