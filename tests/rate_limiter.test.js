/**
 * Тесты для Rate Limiter
 */

const assert = require('assert');
const {
  createRateLimiter,
  presets,
  getRateLimitStats,
  resetRateLimiter,
  stopCleanup,
  getClientIp,
} = require('../utils/rate_limiter');

console.log('Testing rate limiter...');

// Сбросить данные перед тестами
resetRateLimiter();

// Mock request/response объекты
function createMockReq(ip = '127.0.0.1') {
  return {
    ip,
    headers: {},
    connection: { remoteAddress: ip },
  };
}

function createMockRes() {
  const headers = {};
  const res = {
    statusCode: 200,
    setHeader: (key, value) => { headers[key] = value; },
    getHeader: (key) => headers[key],
    status: function(code) {
      this.statusCode = code;
      return this;
    },
    json: function(data) {
      this.body = data;
      return this;
    },
    send: function(data) {
      this.body = data;
      return this;
    },
  };
  return res;
}

// Тест 1: Базовое функционирование
console.log('Test 1: Basic rate limiting...');
const limiter1 = createRateLimiter({
  maxRequests: 3,
  windowMs: 1000,
  headers: true,
});

let blocked = false;
const req1 = createMockReq('192.168.1.1');

// Первые 3 запроса должны пройти
for (let i = 0; i < 3; i++) {
  const res = createMockRes();
  limiter1(req1, res, () => {});
  assert.strictEqual(res.statusCode, 200, `Request ${i + 1} should succeed`);
}

// 4-й запрос должен быть заблокирован
const res4 = createMockRes();
limiter1(req1, res4, () => {
  blocked = false;
});
assert.strictEqual(res4.statusCode, 429, '4th request should be blocked');
assert.ok(res4.body.error, 'Should have error message');
console.log('✓ Basic rate limiting works');

// Тест 2: Headers
console.log('Test 2: Rate limit headers...');
resetRateLimiter();
const limiter2 = createRateLimiter({
  maxRequests: 10,
  windowMs: 60000,
  headers: true,
});

const req2 = createMockReq('192.168.1.2');
const res2 = createMockRes();
limiter2(req2, res2, () => {});

assert.strictEqual(res2.getHeader('X-RateLimit-Limit'), 10, 'Should have limit header');
assert.ok(res2.getHeader('X-RateLimit-Remaining') !== undefined, 'Should have remaining header');
assert.ok(res2.getHeader('X-RateLimit-Reset'), 'Should have reset header');
console.log('✓ Rate limit headers work');

// Тест 3: Разные IP адреса
console.log('Test 3: Per-IP rate limiting...');
resetRateLimiter();
const limiter3 = createRateLimiter({
  maxRequests: 2,
  windowMs: 1000,
});

const reqA = createMockReq('10.0.0.1');
const reqB = createMockReq('10.0.0.2');

// IP A: 2 запроса
for (let i = 0; i < 2; i++) {
  const res = createMockRes();
  limiter3(reqA, res, () => {});
  assert.strictEqual(res.statusCode, 200, 'IP A request should succeed');
}

// IP A: 3-й запрос блокируется
const resA3 = createMockRes();
limiter3(reqA, resA3, () => {});
assert.strictEqual(resA3.statusCode, 429, 'IP A 3rd request should be blocked');

// IP B: должен пройти (другой IP)
const resB1 = createMockRes();
limiter3(reqB, resB1, () => {});
assert.strictEqual(resB1.statusCode, 200, 'IP B request should succeed');
console.log('✓ Per-IP rate limiting works');

// Тест 4: Skip функция
console.log('Test 4: Skip function...');
resetRateLimiter();
const limiter4 = createRateLimiter({
  maxRequests: 1,
  windowMs: 1000,
  skip: (req) => req.path === '/health',
});

const req4health = createMockReq('10.0.0.3');
req4health.path = '/health';

const req4api = createMockReq('10.0.0.3');
req4api.path = '/api/data';

// Health запросы не должны учитываться
for (let i = 0; i < 5; i++) {
  const res = createMockRes();
  limiter4(req4health, res, () => {});
  assert.strictEqual(res.statusCode, 200, 'Health requests should be skipped');
}

// API запрос должен учитываться
const resApi1 = createMockRes();
limiter4(req4api, resApi1, () => {});
assert.strictEqual(resApi1.statusCode, 200, 'First API request should succeed');

const resApi2 = createMockRes();
limiter4(req4api, resApi2, () => {});
assert.strictEqual(resApi2.statusCode, 429, 'Second API request should be blocked');
console.log('✓ Skip function works');

// Тест 5: Custom key generator
console.log('Test 5: Custom key generator...');
resetRateLimiter();
const limiter5 = createRateLimiter({
  maxRequests: 2,
  windowMs: 1000,
  keyGenerator: (req) => req.userId || 'anonymous',
});

const reqUser1 = createMockReq('10.0.0.4');
reqUser1.userId = 'user123';

const reqUser2 = createMockReq('10.0.0.5'); // Другой IP, но тот же user
reqUser2.userId = 'user123';

// Оба запроса от user123 должны учитываться вместе
const res5a = createMockRes();
limiter5(reqUser1, res5a, () => {});
assert.strictEqual(res5a.statusCode, 200, 'User request 1 should succeed');

const res5b = createMockRes();
limiter5(reqUser2, res5b, () => {});
assert.strictEqual(res5b.statusCode, 200, 'User request 2 should succeed');

const res5c = createMockRes();
limiter5(reqUser1, res5c, () => {});
assert.strictEqual(res5c.statusCode, 429, 'User request 3 should be blocked');
console.log('✓ Custom key generator works');

// Тест 6: Presets
console.log('Test 6: Presets configuration...');
assert.ok(presets.strict, 'Should have strict preset');
assert.ok(presets.moderate, 'Should have moderate preset');
assert.ok(presets.lenient, 'Should have lenient preset');
assert.ok(presets.perUser, 'Should have perUser preset');
assert.strictEqual(presets.strict.maxRequests, 5, 'Strict preset should have 5 max requests');
assert.strictEqual(presets.moderate.maxRequests, 100, 'Moderate preset should have 100 max requests');
console.log('✓ Presets work');

// Тест 7: Статистика
console.log('Test 7: Statistics...');
resetRateLimiter();
const limiter7 = createRateLimiter({ maxRequests: 10, windowMs: 60000 });

// Генерируем запросы от разных клиентов
for (let i = 0; i < 3; i++) {
  const req = createMockReq(`10.0.1.${i}`);
  for (let j = 0; j < i + 1; j++) {
    const res = createMockRes();
    limiter7(req, res, () => {});
  }
}

const stats = getRateLimitStats();
assert.strictEqual(stats.totalClients, 3, 'Should track 3 clients');
assert.strictEqual(stats.totalRequests, 6, 'Should track 6 requests total (1+2+3)');
assert.ok(Array.isArray(stats.topClients), 'Should have topClients array');
assert.ok(stats.topClients.length > 0, 'Should have top clients');
console.log(`✓ Statistics work: ${stats.totalClients} clients, ${stats.totalRequests} requests`);

// Тест 8: getClientIp функция
console.log('Test 8: Get client IP...');
const reqWithForwarded = {
  headers: { 'x-forwarded-for': '203.0.113.1, 198.51.100.1' },
  ip: '192.168.1.1',
};
assert.strictEqual(getClientIp(reqWithForwarded), '203.0.113.1', 'Should use x-forwarded-for');

const reqWithRealIp = {
  headers: { 'x-real-ip': '203.0.113.2' },
  ip: '192.168.1.1',
};
assert.strictEqual(getClientIp(reqWithRealIp), '203.0.113.2', 'Should use x-real-ip');

const reqWithIp = { ip: '192.168.1.1', headers: {} };
assert.strictEqual(getClientIp(reqWithIp), '192.168.1.1', 'Should use req.ip');
console.log('✓ Get client IP works');

// Тест 9: Window expiration
console.log('Test 9: Window expiration (async)...');
resetRateLimiter();
const limiter9 = createRateLimiter({
  maxRequests: 2,
  windowMs: 500, // 0.5 секунды
});

const req9 = createMockReq('10.0.2.1');

// Первые 2 запроса
for (let i = 0; i < 2; i++) {
  const res = createMockRes();
  limiter9(req9, res, () => {});
  assert.strictEqual(res.statusCode, 200, `Request ${i + 1} should succeed`);
}

// 3-й запрос блокируется
const res9blocked = createMockRes();
limiter9(req9, res9blocked, () => {});
assert.strictEqual(res9blocked.statusCode, 429, '3rd request should be blocked');

// Ждем истечения окна
setTimeout(() => {
  const res9after = createMockRes();
  limiter9(req9, res9after, () => {});
  assert.strictEqual(res9after.statusCode, 200, 'Request after window should succeed');
  console.log('✓ Window expiration works');

  // Cleanup
  stopCleanup();
  resetRateLimiter();

  console.log('\n✅ All rate limiter tests passed!');
}, 600);
