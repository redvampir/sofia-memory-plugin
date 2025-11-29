const express = require('express');
const request = require('supertest');
const {
  legacyDeprecationMiddleware,
  LEGACY_ENDPOINTS,
  buildNotice,
} = require('../utils/legacy_endpoints');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(legacyDeprecationMiddleware());

  app.post('/save', (req, res) => res.json({ ok: true }));
  app.get('/memory', (req, res) => res.json({ ok: true, value: 'legacy' }));
  app.post('/saveLessonPlan', (req, res) => res.json({ ok: true, message: 'старое сообщение' }));
  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  return app;
}

function findRecommended(path, method) {
  const match = LEGACY_ENDPOINTS.find((item) => item.path === path && item.methods.includes(method));
  if (!match) throw new Error(`Маршрут ${method} ${path} не найден в списке легаси`);
  return match.recommended;
}

(async function run() {
  const app = createApp();

  const resSave = await request(app).post('/save').send({}).expect(200);
  const recommendedSave = findRecommended('/save', 'POST');
  const expectedMessage = buildNotice('/save', recommendedSave);

  if (resSave.headers['x-deprecated-endpoint'] !== 'true') {
    throw new Error('Заголовок X-Deprecated-Endpoint отсутствует для /save');
  }
  if (resSave.body.recommendedEndpoint !== recommendedSave) {
    throw new Error('Неверная рекомендация для /save');
  }
  if (!resSave.body.message.includes(recommendedSave)) {
    throw new Error('Ответ не содержит подсказку по новому пути для /save');
  }
  if (resSave.body.deprecated !== true) {
    throw new Error('Флаг deprecated не выставлен для /save');
  }
  if (resSave.body.deprecatedMessage !== expectedMessage) {
    throw new Error('deprecatedMessage не совпадает с ожидаемым уведомлением');
  }

  const resMemory = await request(app).get('/memory').expect(200);
  const recommendedMemory = findRecommended('/memory', 'GET');
  if (resMemory.headers['x-deprecated-endpoint'] !== 'true') {
    throw new Error('Заголовок X-Deprecated-Endpoint отсутствует для /memory');
  }
  if (resMemory.body.recommendedEndpoint !== recommendedMemory) {
    throw new Error('Неверная рекомендация для /memory');
  }

  const resCustomMessage = await request(app).post('/saveLessonPlan').send({}).expect(200);
  const recommendedLesson = findRecommended('/saveLessonPlan', 'POST');
  if (!resCustomMessage.body.message.includes(recommendedLesson)) {
    throw new Error('Сообщение не дополнено рекомендацией для /saveLessonPlan');
  }
  if (resCustomMessage.body.deprecatedMessage !== buildNotice('/saveLessonPlan', recommendedLesson)) {
    throw new Error('deprecatedMessage не совпадает для /saveLessonPlan');
  }

  const resHealth = await request(app).get('/api/health').expect(200);
  if (resHealth.headers['x-deprecated-endpoint']) {
    throw new Error('Для нового маршрута не должно быть заголовка X-Deprecated-Endpoint');
  }

  console.log('legacy_deprecation тесты пройдены');
})();
