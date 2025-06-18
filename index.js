const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const memory = require('./memory');
const { listMemoryFiles } = require('./memory');
const versioning = require('./versioning');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());

app.post('/saveMemory', memory.saveMemory);
app.post('/readMemory', memory.readMemory);
app.post('/setMemoryRepo', memory.setMemoryRepo);
app.post('/saveLessonPlan', memory.saveLessonPlan);

app.post('/saveNote', memory.saveNote);
app.post('/getContextSnapshot', memory.getContextSnapshot);
app.post('/createUserProfile', memory.createUserProfile);
app.post('/setToken', memory.setToken);
app.get('/readContext', memory.readContext);
app.post('/saveContext', memory.saveContext);
app.get('/plan', memory.readPlan);

app.post('/list', async (req, res) => {
  try {
    const { repo, token, path } = req.body;
    if (!repo || !token || !path) {
      return res.status(400).json({ error: 'Missing repo, token, or path' });
    }

    const fileList = await listMemoryFiles(repo, token, path);
    return res.json({ status: 'success', files: fileList });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/version/commit', versioning.commitInstructions);
app.post('/version/rollback', versioning.rollbackInstructions);
app.post('/version/list', versioning.listVersions);

app.get('/', (req, res) => {
  res.send('Sofia plugin is running');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Sofia Plugin Server running on port ${PORT}`);
});

// Дополнительные alias-маршруты для совместимости
app.post('/save', memory.saveMemory);     // alias for /saveMemory
app.post('/read', memory.readMemory);     // alias for /readMemory
app.post('/set', memory.setMemoryRepo);   // alias for /setMemoryRepo

// Проверка доступности сервера
app.get('/ping', (req, res) => {
  res.send('pong');
});

// Автодокументация
app.get('/docs', (req, res) => {
  res.json({
    endpoints: [
      "POST /saveMemory",
      "POST /readMemory",
      "POST /setMemoryRepo",
      "POST /saveLessonPlan",
      "POST /saveNote",
      "POST /getContextSnapshot",
      "POST /createUserProfile",
      "POST /setToken",
      "GET /readContext",
      "POST /saveContext",
      "POST /version/commit",
      "POST /version/rollback",
      "POST /version/list",
      "POST /list",
      "GET /ping",
      "GET /docs"
    ]
  });
});
