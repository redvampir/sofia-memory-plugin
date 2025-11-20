require('dotenv').config();

// Validate environment variables before starting
const { validateAndLog } = require('./utils/env_validator');
const envConfig = validateAndLog();

const express = require('express');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');
const config = require('./config');
const { setMemoryRepo, auto_recover_context, switchMemoryRepo } = require('./src/memory');
const { startContextChecker } = require('./utils/context_checker');
const { setupGracefulShutdown, rejectDuringShutdown } = require('./utils/graceful_shutdown');
const {
  detailedHealthCheck,
  simpleHealthCheck,
  readinessCheck,
  livenessCheck,
} = require('./utils/health_check');

// CORS middleware without external dependencies
function allowCors(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    return res.sendStatus(200);
  }
  next();
}

const memoryRoutes = require("./api/memory_routes");
const githubRoutes = require("./api/github_routes");
const modeRoutes = require("./api/mode_routes");
const { deprecationMiddleware } = require('./utils/deprecation_middleware');
const { listMemoryFiles } = require("./logic/memory_operations");
const memoryRoutesV2 = require('./api/memory_v2');
const versioning = require('./versioning');
const { getMemoryModeSync } = require('./utils/memory_mode');

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

// Apply middleware
app.use(allowCors);
app.use(rejectDuringShutdown); // Reject requests during shutdown
app.use(deprecationMiddleware);
app.use(express.static(path.join(__dirname, 'assets')));

// Serve plugin descriptors from repository root
app.get('/openapi.yaml', (_req, res) => {
  res.sendFile(path.join(__dirname, 'openapi.yaml'));
});
app.get('/ai-plugin.json', (_req, res) => {
  res.sendFile(path.join(__dirname, 'ai-plugin.json'));
});

app.use(bodyParser.json());

// API routes
app.use(memoryRoutes);
app.use(memoryRoutesV2);
app.use(githubRoutes);
app.use(modeRoutes);

app.post('/switch_memory_repo', async (req, res) => {
  const { type, path, userId } = req.body;
  try {
    const result = await switchMemoryRepo(type, path, userId);
    res.status(200).json({ status: 'OK', mode: result.mode });
  } catch (err) {
    console.error('Ошибка при переключении режима:', err);
    res.status(500).json({ error: err.message });
  }
});

// Route to switch memory repository via query parameter
app.get('/api/switch_memory_repo', async (req, res) => {
  const { type, userId } = req.query;
  try {
    const result = await switchMemoryRepo(type, undefined, userId);
    res.status(200).json({ status: 'ok', mode: result.mode });
  } catch (err) {
    console.error('Ошибка при переключении режима:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/status', (req, res) => {
  const userId = req.query.userId || 'default';
  const mode = getMemoryModeSync(userId);
  res.json({ mode });
});

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

const debugAdminToken = process.env.DEBUG_ADMIN_TOKEN;

function requireDebugToken(req, res, next) {
  const token = req.header('x-admin-token') || req.header('authorization');
  const normalizedToken = token?.startsWith('Bearer ')
    ? token.slice('Bearer '.length)
    : token;

  if (!debugAdminToken || !normalizedToken || normalizedToken !== debugAdminToken) {
    return res.status(403).json({ status: 'forbidden', message: 'Debug access denied' });
  }

  next();
}

// Debug route to inspect index.json
if (process.env.NODE_ENV !== 'production' || debugAdminToken) {
  app.get('/debug/index', requireDebugToken, (req, res) => {
    const indexPath = path.join(__dirname, 'memory', 'index.json');
    if (!fs.existsSync(indexPath)) {
      return res.status(404).json({ status: 'error', message: 'index.json not found' });
    }
    const data = fs.readFileSync(indexPath, 'utf-8');
    res.type('text/plain').send(data);
  });
}

// Дополнительные alias-маршруты для совместимости

const PORT = envConfig.PORT || process.env.PORT || 10000;
const server = app.listen(PORT, () => {
  console.log(`[START] Sofia Plugin is running on port ${PORT}`);
  console.log(`[START] Environment: ${envConfig.NODE_ENV}`);
  console.log(`[START] Memory mode: ${envConfig.MEMORY_MODE}`);
  startContextChecker();
});

// Setup graceful shutdown
setupGracefulShutdown(server);

// Health check endpoints
app.get('/ping', (req, res) => {
  res.send('pong');
});

// Simple health check for monitoring tools
app.get('/health', (_req, res) => {
  const health = simpleHealthCheck();
  res.status(200).json(health);
});

// Detailed health check for debugging
app.get('/health/detailed', (_req, res) => {
  const health = detailedHealthCheck();
  res.status(200).json(health);
});

// Kubernetes readiness probe
app.get('/health/ready', (_req, res) => {
  const readiness = readinessCheck();
  if (readiness.ready) {
    res.status(200).json(readiness);
  } else {
    res.status(503).json(readiness);
  }
});

// Kubernetes liveness probe
app.get('/health/live', (_req, res) => {
  const liveness = livenessCheck();
  res.status(200).json(liveness);
});

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
        "POST /switch_memory_repo",
        "GET /api/switch_memory_repo",
        "GET /api/status",
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
      "POST /github/repos",
      "POST /github/repository",
      "POST /github/file",
        "POST /chat/setup",
        "GET /profile",
        "GET /debug/index",
        "GET /ping",
        "GET /docs"
      ]
  });
});
