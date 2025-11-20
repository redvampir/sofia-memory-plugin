/**
 * Тесты для Log Redactor
 */

const assert = require('assert');
const {
  redactSecrets,
  redactObject,
  getRedactionStats,
  resetRedactionStats,
  REDACTED_MASK
} = require('../utils/log_redactor');

console.log('Testing log redactor...');

// Сбросить статистику перед тестами
resetRedactionStats();

// Тест 1: GitHub Personal Access Token
const githubToken = 'ghp_1234567890abcdefghijklmnopqrstuvwxyz';
const redacted1 = redactSecrets(`User token is ${githubToken}`);
assert.ok(!redacted1.includes(githubToken), 'GitHub token should be redacted');
assert.ok(redacted1.includes(REDACTED_MASK), 'Should contain redacted mask');
console.log('✓ GitHub token redaction works');

// Тест 2: JWT Token
const jwtToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
const redacted2 = redactSecrets(`Authorization: ${jwtToken}`);
assert.ok(!redacted2.includes(jwtToken), 'JWT token should be redacted');
console.log('✓ JWT token redaction works');

// Тест 3: Bearer token
const bearerToken = 'Bearer abc123xyz789def456ghi012jkl345mno678pqr901stu234vwx567';
const redacted3 = redactSecrets(bearerToken);
assert.ok(!redacted3.includes('abc123xyz789def456ghi012jkl345mno678pqr901stu234vwx567'), 'Bearer token should be redacted');
console.log('✓ Bearer token redaction works');

// Тест 4: Пароль в URL
const urlWithPassword = 'https://user:mySecretPassword123@github.com/repo.git';
const redacted4 = redactSecrets(urlWithPassword);
assert.ok(!redacted4.includes('mySecretPassword123'), 'Password in URL should be redacted');
assert.ok(redacted4.includes('***'), 'Should contain redacted mask');
assert.ok(redacted4.includes('@github.com'), 'Should preserve host');
console.log('✓ Password in URL redaction works');

// Тест 5: Hex-encoded secret (TOKEN_SECRET)
const hexSecret = '5420bcadea7d9ef12da445a2db72bb1d1f6a666cb608b66cb93f3b2dec0ca6c4';
const redacted5 = redactSecrets(`TOKEN_SECRET=${hexSecret}`);
assert.ok(!redacted5.includes(hexSecret), 'Hex secret should be redacted');
console.log('✓ Hex secret redaction works');

// Тест 6: Object redaction
const sensitiveObject = {
  username: 'john',
  password: 'secret123',
  token: 'ghp_abcdefghijklmnopqrstuvwxyz1234567890',
  data: {
    apiKey: 'fake_test_key_1234567890abcdefghijklmnopqr',
    publicInfo: 'This is safe'
  }
};

const redactedObj = redactObject(sensitiveObject);
assert.strictEqual(redactedObj.password, REDACTED_MASK, 'Password field should be fully redacted');
assert.strictEqual(redactedObj.token, REDACTED_MASK, 'Token field should be fully redacted');
assert.strictEqual(redactedObj.data.apiKey, REDACTED_MASK, 'API key field should be fully redacted');
assert.strictEqual(redactedObj.username, 'john', 'Safe field should not be redacted');
assert.strictEqual(redactedObj.data.publicInfo, 'This is safe', 'Safe nested field should not be redacted');
console.log('✓ Object redaction works');

// Тест 7: Array redaction
const sensitiveArray = [
  'User token: ghp_1234567890abcdefghijklmnopqrstuvwxyz',
  { password: 'secret' },
  'Normal text'
];

const redactedArr = redactObject(sensitiveArray);
assert.ok(!redactedArr[0].includes('ghp_1234567890abcdefghijklmnopqrstuvwxyz'), 'Token in array should be redacted');
assert.strictEqual(redactedArr[1].password, REDACTED_MASK, 'Password in array object should be redacted');
assert.strictEqual(redactedArr[2], 'Normal text', 'Normal text should not be redacted');
console.log('✓ Array redaction works');

// Тест 8: Обычный текст не должен меняться
const normalText = 'This is a normal log message with some numbers 12345 and words.';
const redacted8 = redactSecrets(normalText);
assert.strictEqual(redacted8, normalText, 'Normal text should not be modified');
console.log('✓ Normal text preservation works');

// Тест 9: API key patterns
const apiKeyText = 'api_key: fake_live_key_1234567890abcdefghijklmnopqr';
const redacted9 = redactSecrets(apiKeyText);
assert.ok(!redacted9.includes('fake_live_key_1234567890abcdefghijklmnopqr'), 'API key should be redacted');
console.log('✓ API key redaction works');

// Тест 10: Статистика redaction
const stats = getRedactionStats();
assert.ok(stats.total > 0, 'Should have redacted some secrets');
assert.ok(stats.byType, 'Should have stats by type');
console.log(`✓ Redaction stats work: ${stats.total} secrets redacted`);
console.log('  Stats by type:', stats.byType);

// Сброс статистики
resetRedactionStats();
const statsAfterReset = getRedactionStats();
assert.strictEqual(statsAfterReset.total, 0, 'Stats should be reset');
console.log('✓ Stats reset works');

console.log('\n✅ All log redactor tests passed!');
