const logger = require('./logger');

const DEPRECATION_VERSION = '5.0.0';

const LEGACY_ENDPOINTS = [
  { path: '/save', methods: ['POST'], recommended: '/api/files/save' },
  { path: '/read', methods: ['POST'], recommended: '/api/files/read' },
  { path: '/readFile', methods: ['POST'], recommended: '/api/files/read' },
  { path: '/saveMemory', methods: ['POST'], recommended: '/api/memory/save' },
  { path: '/readMemory', methods: ['POST'], recommended: '/api/memory/read' },
  { path: '/memory', methods: ['GET'], recommended: '/api/memory/read' },
  { path: '/saveMemoryWithIndex', methods: ['POST'], recommended: '/api/memory/save-with-index' },
  { path: '/loadMemoryToContext', methods: ['POST'], recommended: '/api/memory/load-to-context' },
  { path: '/loadContextFromIndex', methods: ['POST'], recommended: '/api/memory/load-from-index' },
  { path: '/saveLessonPlan', methods: ['POST'], recommended: '/api/lessons/save-plan' },
  { path: '/setMemoryRepo', methods: ['POST'], recommended: '/api/system/switch_repo' },
  { path: '/status', methods: ['GET', 'POST'], recommended: '/api/system/status' },
];

function findLegacyMatch(req, endpoints = LEGACY_ENDPOINTS) {
  return endpoints.find(({ path, methods }) => {
    const methodMatches = !methods || methods.includes(req.method);
    return methodMatches && path === req.path;
  });
}

function buildNotice(path, recommended) {
  return `Эндпоинт ${path} устарел и будет удалён в версии ${DEPRECATION_VERSION}. Используйте ${recommended}.`;
}

function legacyDeprecationMiddleware(options = {}) {
  const endpoints = options.endpoints || LEGACY_ENDPOINTS;

  return function markDeprecated(req, res, next) {
    const match = findLegacyMatch(req, endpoints);
    if (!match) return next();

    const notice = buildNotice(match.path, match.recommended);
    res.set('X-Deprecated-Endpoint', 'true');
    logger.info('[deprecated-endpoint]', {
      method: req.method,
      path: req.originalUrl,
      recommended: match.recommended,
    });

    if (!res.locals.__deprecatedWrapped) {
      const originalJson = res.json.bind(res);
      res.json = (payload) => {
        const base = payload && typeof payload === 'object' ? { ...payload } : { ok: true, data: payload };
        const baseMessage = typeof base.message === 'string' ? base.message.trim() : '';
        const message = baseMessage && baseMessage.includes(match.recommended)
          ? baseMessage
          : [baseMessage, notice].filter(Boolean).join(' ').trim() || notice;

        return originalJson({
          ...base,
          message,
          deprecated: true,
          deprecatedMessage: notice,
          recommendedEndpoint: match.recommended,
        });
      };
      res.locals.__deprecatedWrapped = true;
    }

    return next();
  };
}

module.exports = {
  LEGACY_ENDPOINTS,
  DEPRECATION_VERSION,
  legacyDeprecationMiddleware,
  buildNotice,
  findLegacyMatch,
};
