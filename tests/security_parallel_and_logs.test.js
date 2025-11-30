const assert = require('assert');
const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');

if (!process.env.TOKEN_SECRET) {
  process.env.TOKEN_SECRET = 'test_suite_token_secret';
}

const logger = require('../utils/logger');
const systemRoutes = require('../api/system');
const tokenStore = require('../tools/token_store');

async function проверитьРотациюТокена() {
  const app = express();
  app.use(express.json());
  app.use(systemRoutes);

  const adminToken = 'admin-rotate-test';
  process.env.SYSTEM_ADMIN_TOKEN = adminToken;

  const userId = `parallel-user-${Date.now()}`;

  const отказ = await request(app)
    .post('/api/system/rotate-token')
    .send({ userId })
    .expect(403);
  assert.strictEqual(отказ.body.status, 'forbidden');

  const headers = { 'x-admin-token': adminToken };
  const responses = await Promise.all([
    request(app).post('/api/system/rotate-token').set(headers).send({ userId }),
    request(app).post('/api/system/rotate-token').set(headers).send({ userId }),
    request(app).post('/api/system/rotate-token').set(headers).send({ userId }),
  ]);

  responses.forEach(res => {
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, 'success');
    assert.match(res.body.token, /^[a-f0-9]{48}$/);
  });

  const токены = new Set(responses.map(r => r.body.token));
  assert.ok(токены.size >= 1, 'должен быть хотя бы один сгенерированный токен');

  const сохранённый = await tokenStore.getToken(userId);
  assert.ok(сохранённый, 'токен должен сохраняться');
  assert.ok(токены.has(сохранённый), 'сохранённый токен должен быть из выданных значений');
}

async function проверитьРедакциюЛогов() {
  const logDir = path.join(__dirname, 'tmp_logs');
  fs.mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, 'security.log');

  logger.setLogFile(logPath);
  const секрет = 'ghp_1234567890123456789012';
  const вторичный = 'github_pat_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234';

  logger.info(`Пример с токеном ${секрет}`, { вложенные: { токен: вторичный } });
  await new Promise(resolve => setTimeout(resolve, 20));
  logger.setLogFile(null);

  const содержимое = fs.readFileSync(logPath, 'utf-8');
  assert.ok(!содержимое.includes(секрет), 'сырые токены не должны попадать в лог');
  assert.ok(!содержимое.includes(вторичный), 'вложенные значения должны редактироваться');
  assert.ok(содержимое.includes('***'), 'редактирование должно помечать скрытые данные');
}

async function run() {
  await проверитьРотациюТокена();
  await проверитьРедакциюЛогов();
  console.log('security_parallel_and_logs.test.js: ok');
}

run().catch(err => {
  console.error('security_parallel_and_logs.test.js: failed', err);
  process.exit(1);
});
