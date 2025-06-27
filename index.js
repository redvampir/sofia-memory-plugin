const express = require('express');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');
const config = require('./config');
const { setMemoryRepo, auto_recover_context } = require('./src/memory');

// Мидлвар для разрешения CORS без внешних зависимостей
function allow_cors(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    return res.sendStatus(200);
  }
  next();
}
const memory_routes = require("./api/memory_routes");
const { listMemoryFiles } = require("./logic/memory_operations");
const versioning = require('./versioning');

const app = express();
try {
  const { repo, token } = config.getPluginRepo();
  if (repo || token) {
    setMemoryRepo(token, repo);
    console.log(`[INIT] memory repo ${repo || 'null'} set`);
  }
} catch (e) {
  console.error('[INIT] failed to set memory repo', e.message);
}
auto_recover_context().catch(e =>
  console.error('[INIT] auto recover failed', e.message)
);
app.use(allow_cors);
app.use(express.static(path.join(__dirname, 'assets')));
// Serve plugin descriptors from repository root
app.get('/openapi.yaml', (_req, res) => {
  res.sendFile(path.join(__dirname, 'openapi.yaml'));
});
app.get('/ai-plugin.json', (_req, res) => {
  res.sendFile(path.join(__dirname, 'ai-plugin.json'));
});
app.use(bodyParser.json());
app.use(memory_routes);

app.post('/list', async (req, res) => {
  try {
    const { repo, token, path: dirPath } = req.body;
    if (!repo || !token || !dirPath) {
      return res.status(400).json({ status: 'error', message: 'Missing repo, token, or path' });
    }

    const fileList = await listMemoryFiles(repo, token, dirPath);
    return res.json({ status: 'success', files: fileList });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
});

app.post('/version/commit', versioning.commit_instructions);
app.post('/version/rollback', versioning.rollback_instructions);
app.post('/version/list', versioning.list_versions);

app.get('/', (req, res) => {
  res.send('Sofia plugin is running');
});

// Debug route to inspect index.json
app.get('/debug/index', (req, res) => {
  const indexPath = path.join(__dirname, 'memory', 'index.json');
  if (!fs.existsSync(indexPath)) {
    return res.status(404).json({ status: 'error', message: 'index.json not found' });
  }
  const data = fs.readFileSync(indexPath, 'utf-8');
  res.type('text/plain').send(data);
});

// Дополнительные alias-маршруты для совместимости

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`[START] Sofia Plugin is running on port ${PORT}`);
});

// Проверка доступности сервера
app.get('/ping', (req, res) => {
  res.send('pong');
});

// Health check route for Render
app.get('/health', (_req, res) => res.send('OK'));

// Автодокументация
app.get('/docs', (req, res) => {
  res.json({
      endpoints: [
        "POST /save",
        "POST /saveMemory",
        "GET /memory",
        "POST /readMemory",
        "POST /read",
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
