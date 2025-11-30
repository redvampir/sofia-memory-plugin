const assert = require('assert');
const logger = require('../utils/logger');

const initialLevel = process.env.LOG_LEVEL || 'info';

function resetLogger() {
  logger.setLogFile(null);
  logger.setLogLevel(initialLevel);
}

function captureWarnLogging(action) {
  const messages = [];
  const originalWarn = console.warn;
  console.warn = (...args) => messages.push(args.join(' '));
  try {
    action();
  } finally {
    console.warn = originalWarn;
  }
  return messages;
}

(async function run() {
  try {
    logger.setLogFile(null);
    logger.setLogLevel('debug');
    let outputs = captureWarnLogging(() => logger.warn('Проверка warn', { foo: 'bar' }));
    assert.strictEqual(outputs.length, 1, 'warn должен писать одно сообщение');
    assert.ok(outputs[0].includes('WARN'), 'уровень WARN присутствует');
    assert.ok(outputs[0].includes('foo'), 'данные включены в лог');

    const secret = 'ghp_12345678901234567890';
    logger.setLogLevel('debug');
    outputs = captureWarnLogging(() => logger.warn(`Секрет ${secret}`, { token: secret }));
    assert.strictEqual(outputs.length, 1, 'warn с секретом должен логироваться');
    assert.ok(!outputs[0].includes(secret), 'секрет должен быть скрыт');
    assert.ok(outputs[0].includes('***'), 'маскирование выполнено');

    logger.setLogLevel('error');
    outputs = captureWarnLogging(() => logger.warn('Не должно логироваться'));
    assert.strictEqual(outputs.length, 0, 'warn не должен логироваться на уровне error');

    console.log('logger warn tests passed');
  } finally {
    resetLogger();
  }
})();
