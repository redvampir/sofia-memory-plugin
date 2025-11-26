require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');
const config = require('./config');
const { setMemoryRepo, auto_recover_context, switchMemoryRepo } = require('./src/memory');
const { start_context_checker } = require('./utils/context_checker');

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
const github_routes = require("./api/github_routes");
const mode_routes = require("./api/mode_routes");
const meta_routes = require('./api/meta_routes');
const lesson_routes = require('./api/lesson_routes');
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
app.use(allow_cors);
app.use(express.static(path.join(__dirname, 'assets')));
// Serve plugin descriptors from repository root
app.get('/openapi.yaml', (_req, res) => {
  res.sendFile(path.join(__dirname, 'openapi.yaml'));
});
app.get('/ai-plugin.json', (_req, res) => {
  res.sendFile(path.join(__dirname, 'ai-plugin.json'));
});
app.get('/.well-known/openapi.yaml', (_req, res) => {
  res.sendFile(path.join(__dirname, '.well-known', 'openapi.yaml'));
});
app.get('/.well-known/ai-plugin.json', (_req, res) => {
  res.sendFile(path.join(__dirname, 'ai-plugin.json'));
});
app.use(bodyParser.json());
app.use(memory_routes);
app.use(memoryRoutesV2);
app.use(github_routes);
app.use(mode_routes);
app.use(meta_routes);
app.use(lesson_routes);

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

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`[START] Sofia Plugin is running on port ${PORT}`);
  start_context_checker();
});

// Проверка доступности сервера
app.get('/ping', (req, res) => {
  res.status(200).json({ ok: true, message: 'pong' });
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
        "GET /api/meta",
        "POST /lesson/log",
        "GET /lesson/today",
        "GET /lesson/statuses",
        "POST /chat/setup",
        "GET /profile",
        "GET /debug/index",
        "GET /ping",
        "GET /docs"
      ],
      meta: {
        endpoint: 'GET /api/meta',
        description: 'Возвращает список метаданных заметок из data/meta_index.json с фильтрами, сортировкой и пагинацией.',
        params: {
          date: 'ISO 8601, нижняя граница даты (>=), пример: 2024-01-01T00:00:00Z',
          tags: 'Один или несколько тегов через запятую или несколькими параметрами. Совпадение по любому тегу.',
          authors: 'Аналогично tags: фильтрация по авторам с совпадением хотя бы одного значения.',
          page: 'Номер страницы, целое >= 1. По умолчанию 1.',
          limit: 'Размер страницы, положительное целое. Максимум 200 — всё большее будет обрезано.',
          sort: 'Поле сортировки: date (по умолчанию) или title.',
          order: 'Направление сортировки: desc (по умолчанию) или asc.'
        },
        filtering: [
          'По date возвращаются записи не раньше указанной даты',
          'По tags и authors запись проходит, если совпадает хотя бы один элемент',
          'Пагинация задаётся параметрами page и limit, сортировка — sort и order'
        ],
        example: {
          request: 'GET /api/meta?tags=meeting,notes&date=2024-01-01T00:00:00Z&page=1&limit=2&sort=title&order=asc',
          response: {
            ok: true,
            total: 12,
            page: 1,
            pageSize: 2,
            sortBy: 'title',
            order: 'asc',
            items: [
              { title: 'Daily notes', date: '2024-02-01T10:00:00Z', tags: ['meeting'], authors: ['alex'] },
              { title: 'Design review', date: '2024-01-15T12:00:00Z', tags: ['notes'], authors: ['kate'] }
            ]
          }
        },
        docs: 'Подробности: docs/memory-api.md#get-apimeta'
      },
      lessons: {
        log: {
          endpoint: 'POST /lesson/log',
          description: 'Создаёт или обновляет запись о ходе урока в data/lessons.json с проверкой полей и блокировкой файла.',
          body: {
            lesson_id: 'Строка-идентификатор урока (обязательно).',
            date: 'Полный ISO UTC штамп (пример: 2024-05-01T00:00:00.000Z).',
            status: 'Статус из списка: planned, in_progress, done, skipped, failed.',
            score: 'Число от 0 до 1 (точность выполнения).',
            notes: 'Необязательная строка с заметками.'
          },
          response: { ok: true },
          docs: 'Подробности: docs/lesson-logs.md#post-lessonlog'
        },
        today: {
          endpoint: 'GET /lesson/today',
          description: 'Возвращает записи за текущую UTC-дату с опциональной фильтрацией по статусу.',
          params: {
            status: 'Необязательный статус из перечисления planned, in_progress, done, skipped, failed.'
          },
          response: { ok: true, items: '[...]' },
          docs: 'Подробности: docs/lesson-logs.md#get-lessontoday'
        },
        statuses: {
          endpoint: 'GET /lesson/statuses',
          description: 'Служебный список допустимых статусов для валидации на клиенте.',
          response: { ok: true, statuses: '[...]' },
          docs: 'Подробности: docs/lesson-logs.md#get-lessonstatuses'
        }
      }
  });
});
