const express = require('express');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');
const memory = require('./memory');
const { listMemoryFiles } = memory;
const versioning = require('./versioning');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());

app.post('/saveMemory', memory.saveMemory);
app.post('/readMemory', memory.readMemory);
app.get('/memory', memory.readMemoryGET);
app.post('/setMemoryRepo', memory.setMemoryRepo);
app.post('/saveLessonPlan', memory.saveLessonPlan);
app.post('/saveMemoryWithIndex', memory.saveMemoryWithIndex);

app.post('/getToken', memory.getToken);
app.post('/saveNote', memory.saveNote);
app.post('/getContextSnapshot', memory.getContextSnapshot);
app.post('/createUserProfile', memory.createUserProfile);
app.post('/setToken', memory.setToken);
app.get('/token/status', memory.tokenStatus);
app.get('/tokenStatus', memory.tokenStatus); // alias for /token/status
app.get('/readContext', memory.readContext);
app.post('/saveContext', memory.saveContext);
app.post('/chat/setup', memory.chatSetupCommand);
app.post('/updateIndex', memory.updateIndexManual);
app.get('/plan', memory.readPlan);
app.get('/profile', memory.readProfile);

app.post('/list', async (req, res) => {
  try {
    const { repo, token, path: dirPath } = req.body;
    if (!repo || !token || !dirPath) {
      return res.status(400).json({ error: 'Missing repo, token, or path' });
    }

    const fileList = await listMemoryFiles(repo, token, dirPath);
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

// Debug route to inspect index.json
app.get('/debug/index', (req, res) => {
  const indexPath = path.join(__dirname, 'memory', 'index.json');
  if (!fs.existsSync(indexPath)) {
    return res.status(404).send('index.json not found');
  }
  const data = fs.readFileSync(indexPath, 'utf-8');
  res.type('text/plain').send(data);
});

// Дополнительные alias-маршруты для совместимости
app.post('/save', memory.saveMemory);     // alias for /saveMemory
app.post('/read', memory.readMemory);     // alias for /readMemory
app.post('/set', memory.setMemoryRepo);   // alias for /setMemoryRepo

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Sofia Plugin Server running on port ${PORT}`);
});

// Проверка доступности сервера
app.get('/ping', (req, res) => {
  res.send('pong');
});

// Автодокументация
app.get('/docs', (req, res) => {
  res.json({
      endpoints: [
        "POST /saveMemory",
        "GET /memory",
        "POST /readMemory",
        "POST /setMemoryRepo",
        "POST /saveLessonPlan",
        "POST /saveMemoryWithIndex",
        "POST /saveNote",
        "POST /getContextSnapshot",
        "POST /createUserProfile",
        "POST /setToken",
        "POST /getToken",
        "GET /token/status",
        "GET /readContext",
        "POST /saveContext",
      "POST /version/commit",
      "POST /version/rollback",
      "POST /version/list",
      "POST /list",
      "POST /updateIndex",
        "POST /chat/setup",
        "GET /profile",
        "GET /debug/index",
        "GET /ping",
        "GET /docs"
      ]
  });
});
