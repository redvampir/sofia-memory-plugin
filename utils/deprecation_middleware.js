/**
 * Middleware для обработки deprecated API endpoints
 *
 * Добавляет предупреждения для устаревших эндпоинтов и
 * логирует их использование для отслеживания миграции.
 */

const path = require('path');
const fs = require('fs');

// Карта legacy -> новых эндпоинтов
const DEPRECATED_ENDPOINTS = {
  // Файловые операции
  'POST /save': 'POST /api/files/save',
  'POST /read': 'POST /api/files/read',

  // Операции с памятью
  'POST /saveMemory': 'POST /api/memory/save',
  'POST /readMemory': 'POST /api/memory/read',
  'POST /saveMemoryWithIndex': 'POST /api/memory/save-with-index',
  'POST /loadToContext': 'POST /api/memory/load-to-context',
  'GET /memory': 'GET /api/memory/context',

  // Уроки
  'POST /saveLessonPlan': 'POST /api/lessons/save-plan',
  'POST /saveAnswer': 'POST /api/lessons/save-answer',
  'POST /version/commit': 'POST /api/lessons/version/commit',
  'POST /version/rollback': 'POST /api/lessons/version/rollback',

  // GitHub
  'POST /github/repos': 'POST /api/github/repos',
  'POST /github/repository': 'POST /api/github/repository',
  'POST /github/file': 'POST /api/github/file',
  'POST /setToken': 'POST /api/github/set-token',
  'GET /token/status': 'GET /api/github/token/status',

  // Системные
  'POST /setMemoryRepo': 'POST /api/system/switch_repo',
  'POST /switch_memory_repo': 'POST /api/system/switch_repo',
  'GET /api/switch_memory_repo': 'POST /api/system/switch_repo',
  'GET /profile': 'GET /api/system/profile',
  'GET /status': 'GET /api/system/status',
};

// Лог файл для отслеживания использования
const LOG_FILE = path.join(__dirname, '..', '.deprecation_log.json');

/**
 * Логирует использование deprecated endpoint
 * @param {string} method
 * @param {string} endpoint
 * @param {string} ip
 */
function logDeprecatedUsage(method, endpoint, ip) {
  const key = `${method} ${endpoint}`;
  const timestamp = new Date().toISOString();

  let log = {};
  if (fs.existsSync(LOG_FILE)) {
    try {
      log = JSON.parse(fs.readFileSync(LOG_FILE, 'utf-8'));
    } catch {
      log = {};
    }
  }

  if (!log[key]) {
    log[key] = {
      firstSeen: timestamp,
      count: 0,
      lastSeen: timestamp,
      ips: [],
    };
  }

  log[key].count += 1;
  log[key].lastSeen = timestamp;

  // Добавляем IP если его нет
  if (!log[key].ips.includes(ip)) {
    log[key].ips.push(ip);
  }

  // Сохраняем лог
  try {
    fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2), 'utf-8');
  } catch (error) {
    console.error('[DEPRECATION] Failed to write log:', error.message);
  }
}

/**
 * Middleware для deprecated endpoints
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
function deprecationMiddleware(req, res, next) {
  const key = `${req.method} ${req.path}`;
  const newEndpoint = DEPRECATED_ENDPOINTS[key];

  if (newEndpoint) {
    const clientIp = req.ip || req.connection.remoteAddress || 'unknown';

    // Добавляем заголовок
    res.setHeader('X-Deprecated-Endpoint', 'true');
    res.setHeader('X-Recommended-Endpoint', newEndpoint);

    // Логируем использование
    logDeprecatedUsage(req.method, req.path, clientIp);

    // Выводим warning в консоль
    console.warn(
      `⚠️  [DEPRECATION] ${key} is deprecated. Use ${newEndpoint} instead. Client: ${clientIp}`
    );
  }

  next();
}

/**
 * Получить статистику использования deprecated endpoints
 * @returns {Object}
 */
function getDeprecationStats() {
  if (!fs.existsSync(LOG_FILE)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(LOG_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

/**
 * Очистить лог deprecated endpoints
 */
function clearDeprecationLog() {
  if (fs.existsSync(LOG_FILE)) {
    fs.unlinkSync(LOG_FILE);
  }
}

/**
 * Получить список всех deprecated endpoints
 * @returns {Array<Object>}
 */
function getDeprecatedEndpoints() {
  return Object.entries(DEPRECATED_ENDPOINTS).map(([old, recommended]) => ({
    old,
    recommended,
    method: old.split(' ')[0],
    path: old.split(' ')[1],
  }));
}

module.exports = {
  deprecationMiddleware,
  getDeprecationStats,
  clearDeprecationLog,
  getDeprecatedEndpoints,
  DEPRECATED_ENDPOINTS,
};
