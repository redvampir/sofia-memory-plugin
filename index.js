const express = require('express');
const bodyParser = require('body-parser');
const memory = require('./memory');
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
      "POST /version/commit",
      "POST /version/rollback",
      "POST /version/list",
      "GET /ping",
      "GET /docs"
    ]
  });
});
