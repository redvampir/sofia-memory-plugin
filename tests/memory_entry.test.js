const assert = require('assert');
const {
  MEMORY_STATUSES,
  PriorityValidationError,
  TrustValidationError,
  StatusValidationError,
  assertPriority,
  assertTrust,
  assertStatus,
} = require('../src/memory/memory_entry.ts');

(function run() {
  // Проверка приоритетов
  assert.strictEqual(assertPriority(0), 0, 'минимальный приоритет допускается');
  assert.strictEqual(assertPriority(3), 3, 'максимальный приоритет допускается');
  assert.throws(() => assertPriority(1.5), PriorityValidationError, 'дробные значения отклоняются');
  assert.throws(() => assertPriority(-1), PriorityValidationError, 'меньше 0 отклоняется');
  assert.throws(() => assertPriority(4), PriorityValidationError, 'больше 3 отклоняется');

  // Проверка доверия
  assert.strictEqual(assertTrust(0), 0, 'доверие 0 допускается');
  assert.strictEqual(assertTrust(0.5), 0.5, 'доверие 0.5 допускается');
  assert.strictEqual(assertTrust(1), 1, 'доверие 1 допускается');
  assert.throws(() => assertTrust(-0.01), TrustValidationError, 'доверие меньше 0 отклоняется');
  assert.throws(() => assertTrust(1.01), TrustValidationError, 'доверие больше 1 отклоняется');
  assert.throws(() => assertTrust('высокое'), TrustValidationError, 'нечисловое доверие отклоняется');

  // Проверка статусов
  for (const status of MEMORY_STATUSES) {
    assert.strictEqual(assertStatus(status), status, `статус ${status} валиден`);
  }
  assert.throws(() => assertStatus(''), StatusValidationError, 'пустая строка отклоняется');
  assert.throws(() => assertStatus('deleted'), StatusValidationError, 'неизвестный статус отклоняется');
  assert.throws(() => assertStatus(123), StatusValidationError, 'некорректный тип статуса отклоняется');

  console.log('memory entry validation tests passed');
})();
