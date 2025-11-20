/**
 * Log Redactor - автоматическая замена секретных данных в логах
 *
 * Защищает от случайного логирования:
 * - GitHub токенов
 * - TOKEN_SECRET
 * - API ключей
 * - JWT токенов
 * - Паролей
 */

/**
 * Паттерны для обнаружения секретов
 */
const SECRET_PATTERNS = [
  // GitHub Personal Access Tokens
  { regex: /ghp_[A-Za-z0-9_]{36,}/gi, name: 'GitHub Token' },
  { regex: /github_pat_[A-Za-z0-9_]{22,}/gi, name: 'GitHub PAT' },
  { regex: /gho_[A-Za-z0-9_]{36,}/gi, name: 'GitHub OAuth' },
  { regex: /ghs_[A-Za-z0-9_]{36,}/gi, name: 'GitHub Server Token' },

  // Generic tokens (длинные алфавитно-цифровые строки)
  { regex: /(?:^|[^A-Za-z0-9])([A-Za-z0-9_-]{40,})(?:[^A-Za-z0-9]|$)/g, name: 'Long Token', replace: '$1' },

  // JWT токены
  { regex: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/gi, name: 'JWT Token' },

  // API ключи (различные форматы)
  { regex: /(?:api[_-]?key|apikey|access[_-]?token|secret[_-]?key)[\s:=]+["']?([A-Za-z0-9_-]{20,})["']?/gi, name: 'API Key' },

  // Пароли в URL
  { regex: /([a-z]+:\/\/[^:]+:)([^@]+)(@[^\s]+)/gi, name: 'Password in URL', replace: '$1***$3' },

  // Bearer tokens
  { regex: /Bearer\s+([A-Za-z0-9_-]{20,})/gi, name: 'Bearer Token' },

  // Hex-encoded secrets (32+ characters)
  { regex: /\b([a-f0-9]{64,})\b/gi, name: 'Hex Secret' },
];

/**
 * Маска для замены секретов
 */
const REDACTED_MASK = '***REDACTED***';

/**
 * Счетчик обнаруженных секретов (для мониторинга)
 */
const redactionStats = {
  total: 0,
  byType: {}
};

/**
 * Redact secrets в строке
 * @param {string} text - Текст для обработки
 * @returns {string} Текст с замененными секретами
 */
function redactSecrets(text) {
  if (typeof text !== 'string') {
    return text;
  }

  let redacted = text;

  for (const pattern of SECRET_PATTERNS) {
    if (pattern.regex.test(redacted)) {
      redacted = redacted.replace(pattern.regex, (match, ...groups) => {
        // Статистика
        redactionStats.total++;
        redactionStats.byType[pattern.name] = (redactionStats.byType[pattern.name] || 0) + 1;

        // Если есть кастомная замена с группами
        if (pattern.replace) {
          return pattern.replace.replace(/\$(\d+)/g, (_, num) => {
            const groupIndex = parseInt(num) - 1;
            return groupIndex === 0 ? REDACTED_MASK : (groups[groupIndex] || '');
          });
        }

        return REDACTED_MASK;
      });

      // Сброс lastIndex для глобальных regex
      pattern.regex.lastIndex = 0;
    }
  }

  return redacted;
}

/**
 * Redact secrets в объекте (рекурсивно)
 * @param {any} obj - Объект для обработки
 * @returns {any} Объект с замененными секретами
 */
function redactObject(obj) {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return redactSecrets(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(item => redactObject(item));
  }

  if (typeof obj === 'object') {
    const redacted = {};
    for (const [key, value] of Object.entries(obj)) {
      // Ключи, которые нужно полностью скрыть
      const sensitiveKeys = ['token', 'password', 'secret', 'apikey', 'api_key', 'authorization'];
      if (sensitiveKeys.some(k => key.toLowerCase().includes(k))) {
        redacted[key] = REDACTED_MASK;
      } else {
        redacted[key] = redactObject(value);
      }
    }
    return redacted;
  }

  return obj;
}

/**
 * Создает безопасную обертку для функции логирования
 * @param {Function} originalFn - Оригинальная функция логирования
 * @returns {Function} Обертка с redaction
 */
function createRedactedLogger(originalFn) {
  return function(...args) {
    const redactedArgs = args.map(arg => {
      if (typeof arg === 'string') {
        return redactSecrets(arg);
      }
      if (typeof arg === 'object') {
        return redactObject(arg);
      }
      return arg;
    });

    return originalFn.apply(this, redactedArgs);
  };
}

/**
 * Патчит глобальные console методы для автоматического redaction
 * Внимание: влияет на весь процесс!
 */
function patchConsole() {
  const methods = ['log', 'info', 'warn', 'error', 'debug'];

  for (const method of methods) {
    if (console[method]) {
      const original = console[method];
      console[method] = createRedactedLogger(original);
      // Сохраняем оригинал для внутренних нужд
      console[`_original_${method}`] = original;
    }
  }
}

/**
 * Восстанавливает оригинальные console методы
 */
function unpatchConsole() {
  const methods = ['log', 'info', 'warn', 'error', 'debug'];

  for (const method of methods) {
    if (console[`_original_${method}`]) {
      console[method] = console[`_original_${method}`];
      delete console[`_original_${method}`];
    }
  }
}

/**
 * Express middleware для redaction request/response
 */
function expressRedactorMiddleware(req, res, next) {
  // Redact в headers
  const originalGet = req.get.bind(req);
  req.get = function(name) {
    const value = originalGet(name);
    if (name && name.toLowerCase() === 'authorization') {
      return REDACTED_MASK;
    }
    return value;
  };

  // Redact в query parameters
  if (req.query && req.query.token) {
    req.query.token = REDACTED_MASK;
  }

  // Redact в body (для логирования)
  const originalJson = res.json.bind(res);
  res.json = function(data) {
    // Логируем только redacted версию
    if (process.env.NODE_ENV !== 'production') {
      const redactedData = redactObject(data);
      // Используем оригинальный console если он сохранен
      const logger = console._original_log || console.log;
      logger('[Response]', redactedData);
    }
    return originalJson(data);
  };

  next();
}

/**
 * Получить статистику redaction
 * @returns {object} Статистика обнаруженных секретов
 */
function getRedactionStats() {
  return { ...redactionStats };
}

/**
 * Сбросить статистику
 */
function resetRedactionStats() {
  redactionStats.total = 0;
  redactionStats.byType = {};
}

module.exports = {
  redactSecrets,
  redactObject,
  createRedactedLogger,
  patchConsole,
  unpatchConsole,
  expressRedactorMiddleware,
  getRedactionStats,
  resetRedactionStats,
  REDACTED_MASK
};
