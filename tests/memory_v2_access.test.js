const assert = require('assert');

function withMockedAccessControl(mock, fn) {
  const modulePath = require.resolve('../utils/access_control');
  const original = require.cache[modulePath];

  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports: { checkAccess: mock },
  };

  try {
    fn();
  } finally {
    if (original) {
      require.cache[modulePath] = original;
    } else {
      delete require.cache[modulePath];
    }
  }
}

function findHandler(router, routePath, method) {
  const layer = router.stack.find(
    l => l.route && l.route.path === routePath && l.route.methods[method]
  );
  if (!layer) {
    throw new Error(`Маршрут ${method.toUpperCase()} ${routePath} не найден`);
  }
  return layer.route.stack[0].handle;
}

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

withMockedAccessControl(() => ({ allowed: false, message: 'Чтение запрещено' }), () => {
  const router = require('../api/memory_v2');

  const searchHandler = findHandler(router, '/memory/search', 'post');
  const searchRes = createRes();
  searchHandler({ body: {} }, searchRes);
  assert.strictEqual(searchRes.statusCode, 403, 'поиск должен блокироваться при запрете доступа');
  assert.deepStrictEqual(searchRes.body, { status: 'error', message: 'Чтение запрещено' });

  const contextHandler = findHandler(router, '/memory/get_context', 'post');
  const ctxRes = createRes();
  contextHandler({ body: { token_budget: 10 } }, ctxRes);
  assert.strictEqual(ctxRes.statusCode, 403, 'выдача контекста должна блокироваться при запрете доступа');
  assert.deepStrictEqual(ctxRes.body, { status: 'error', message: 'Чтение запрещено' });
});

console.log('memory_v2_access.test.js: ok');
