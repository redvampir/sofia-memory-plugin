/**
 * Rate Limiter - защита API от злоупотреблений и DoS атак
 *
 * Реализация без внешних зависимостей с использованием:
 * - Sliding window algorithm
 * - Per-IP tracking
 * - Configurable limits
 * - Automatic cleanup
 */

/**
 * In-memory store для отслеживания запросов
 * Structure: Map<clientId, Array<timestamp>>
 */
const requestLog = new Map();

/**
 * Конфигурация по умолчанию
 */
const DEFAULT_CONFIG = {
  // Максимум запросов за окно
  maxRequests: 100,
  // Размер окна в миллисекундах (15 минут)
  windowMs: 15 * 60 * 1000,
  // Сообщение при превышении лимита
  message: 'Too many requests, please try again later',
  // Статус код при превышении лимита
  statusCode: 429,
  // Заголовки в ответе
  headers: true,
  // Skip successful requests (не учитывать успешные запросы)
  skipSuccessfulRequests: false,
  // Skip failed requests (не учитывать неудачные запросы)
  skipFailedRequests: false,
  // Функция для получения идентификатора клиента
  keyGenerator: null,
  // Handler для превышения лимита
  handler: null,
  // Skip функция для пропуска определенных запросов
  skip: null,
};

/**
 * Получить IP адрес клиента из request
 * @param {object} req - Express request
 * @returns {string} IP адрес
 */
function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.ip ||
    'unknown'
  );
}

/**
 * Очистить устаревшие записи из requestLog
 * @param {number} windowMs - Размер окна в миллисекундах
 */
function cleanupOldEntries(windowMs) {
  const now = Date.now();
  const cutoff = now - windowMs;

  for (const [key, timestamps] of requestLog.entries()) {
    // Удалить старые timestamps
    const validTimestamps = timestamps.filter(ts => ts > cutoff);

    if (validTimestamps.length === 0) {
      // Если нет валидных timestamps, удалить ключ
      requestLog.delete(key);
    } else {
      // Обновить список timestamps
      requestLog.set(key, validTimestamps);
    }
  }
}

/**
 * Периодическая очистка памяти
 */
let cleanupInterval = null;

function startCleanupInterval(windowMs) {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
  }

  // Очистка каждые 5 минут
  cleanupInterval = setInterval(() => {
    cleanupOldEntries(windowMs);
  }, 5 * 60 * 1000);

  // Не блокировать процесс от завершения
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }
}

/**
 * Создать rate limiter middleware
 * @param {object} options - Опции конфигурации
 * @returns {Function} Express middleware
 */
function createRateLimiter(options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };

  // Запустить периодическую очистку
  startCleanupInterval(config.windowMs);

  return function rateLimiterMiddleware(req, res, next) {
    // Skip функция - пропустить rate limiting для определенных запросов
    if (config.skip && config.skip(req, res)) {
      return next();
    }

    // Получить идентификатор клиента
    const key = config.keyGenerator ? config.keyGenerator(req) : getClientIp(req);

    // Получить текущее время
    const now = Date.now();
    const windowStart = now - config.windowMs;

    // Получить историю запросов клиента
    let timestamps = requestLog.get(key) || [];

    // Удалить устаревшие timestamps (вне окна)
    timestamps = timestamps.filter(ts => ts > windowStart);

    // Проверить лимит
    const requestCount = timestamps.length;
    const limitReached = requestCount >= config.maxRequests;

    // Добавить заголовки о лимитах
    if (config.headers) {
      res.setHeader('X-RateLimit-Limit', config.maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, config.maxRequests - requestCount - 1));
      res.setHeader('X-RateLimit-Reset', new Date(windowStart + config.windowMs).toISOString());
    }

    // Если лимит достигнут
    if (limitReached) {
      res.setHeader('Retry-After', Math.ceil(config.windowMs / 1000));

      if (config.handler) {
        return config.handler(req, res, next);
      }

      return res.status(config.statusCode).json({
        error: config.message,
        retryAfter: Math.ceil(config.windowMs / 1000),
      });
    }

    // Добавить текущий timestamp
    timestamps.push(now);
    requestLog.set(key, timestamps);

    // Track response для skipSuccessfulRequests/skipFailedRequests
    if (config.skipSuccessfulRequests || config.skipFailedRequests) {
      const originalSend = res.send;
      const originalJson = res.json;

      const checkAndRemove = () => {
        const shouldSkip =
          (config.skipSuccessfulRequests && res.statusCode < 400) ||
          (config.skipFailedRequests && res.statusCode >= 400);

        if (shouldSkip) {
          // Удалить последний timestamp
          const currentTimestamps = requestLog.get(key);
          if (currentTimestamps && currentTimestamps.length > 0) {
            currentTimestamps.pop();
            requestLog.set(key, currentTimestamps);
          }
        }
      };

      res.send = function(...args) {
        checkAndRemove();
        return originalSend.apply(res, args);
      };

      res.json = function(...args) {
        checkAndRemove();
        return originalJson.apply(res, args);
      };
    }

    next();
  };
}

/**
 * Preset конфигурации для разных случаев
 */
const presets = {
  // Строгий лимит для auth endpoints
  strict: {
    maxRequests: 5,
    windowMs: 15 * 60 * 1000, // 15 минут
    message: 'Too many authentication attempts, please try again later',
  },

  // Средний лимит для API endpoints
  moderate: {
    maxRequests: 100,
    windowMs: 15 * 60 * 1000, // 15 минут
  },

  // Легкий лимит для публичных endpoints
  lenient: {
    maxRequests: 300,
    windowMs: 15 * 60 * 1000, // 15 минут
  },

  // Per-user лимит (требует userId в req)
  perUser: {
    maxRequests: 1000,
    windowMs: 60 * 60 * 1000, // 1 час
    keyGenerator: (req) => {
      const userId = req.userId || req.query.userId || req.body.userId || 'anonymous';
      return `user:${userId}`;
    },
  },
};

/**
 * Получить статистику rate limiting
 * @returns {object} Статистика
 */
function getRateLimitStats() {
  const stats = {
    totalClients: requestLog.size,
    totalRequests: 0,
    topClients: [],
  };

  const clientRequests = [];

  for (const [key, timestamps] of requestLog.entries()) {
    stats.totalRequests += timestamps.length;
    clientRequests.push({
      client: key,
      requests: timestamps.length,
    });
  }

  // Топ 10 клиентов по количеству запросов
  clientRequests.sort((a, b) => b.requests - a.requests);
  stats.topClients = clientRequests.slice(0, 10);

  return stats;
}

/**
 * Очистить все данные rate limiting (для тестов)
 */
function resetRateLimiter() {
  requestLog.clear();
}

/**
 * Остановить cleanup interval
 */
function stopCleanup() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

module.exports = {
  createRateLimiter,
  presets,
  getRateLimitStats,
  resetRateLimiter,
  stopCleanup,
  getClientIp,
};
