const fs = require('fs');
const path = require('path');
const assert = require('assert');
const express = require('express');
const request = require('supertest');
const metaRoutes = require('../api/meta_routes');

const metaIndexPath = path.join(__dirname, '..', 'data', 'meta_index.json');

const ТЕСТОВЫЕ_ДАННЫЕ = [
  {
    id: '1',
    title: 'Alpha',
    date: '2024-01-10T10:00:00Z',
    tags: ['AI', 'backend'],
    authors: ['alice'],
  },
  {
    id: '2',
    title: 'Beta',
    date: '2024-02-05T08:00:00Z',
    tags: ['ml'],
    authors: ['bob'],
  },
  {
    id: '3',
    title: 'Gamma',
    date: '2024-03-20T18:30:00Z',
    tags: ['ai', 'ux'],
    authors: ['carol', 'alice'],
  },
  {
    id: '4',
    title: 'Delta',
    date: '2023-12-31T23:59:59Z',
    tags: ['ops'],
    authors: ['dave'],
  },
];

function подготовитьMetaIndex() {
  const существовал = fs.existsSync(metaIndexPath);
  const резерв = существовал ? fs.readFileSync(metaIndexPath, 'utf-8') : null;
  fs.writeFileSync(metaIndexPath, JSON.stringify(ТЕСТОВЫЕ_ДАННЫЕ, null, 2));
  return () => {
    if (существовал) {
      fs.writeFileSync(metaIndexPath, резерв);
    } else {
      fs.unlinkSync(metaIndexPath);
    }
  };
}

function создатьПриложение() {
  const app = express();
  app.use(metaRoutes);
  return app;
}

function сравнитьИдентификаторы(items, ожидаемые) {
  const ids = items.map((item) => item.id);
  assert.deepStrictEqual(ids, ожидаемые);
}

async function проверитьБазовуюВыборку(app) {
  const res = await request(app).get('/api/meta').expect(200);
  assert.strictEqual(res.body.ok, true);
  assert.strictEqual(res.body.total, ТЕСТОВЫЕ_ДАННЫЕ.length);
  сравнитьИдентификаторы(res.body.items, ['3', '2', '1', '4']);
}

async function проверитьФильтрациюПоТегам(app) {
  const res = await request(app).get('/api/meta').query({ tags: 'ai' }).expect(200);
  assert.strictEqual(res.body.ok, true);
  сравнитьИдентификаторы(res.body.items, ['3', '1']);
}

async function проверитьФильтрациюПоАвторам(app) {
  const res = await request(app).get('/api/meta').query({ authors: 'alice' }).expect(200);
  assert.strictEqual(res.body.ok, true);
  сравнитьИдентификаторы(res.body.items, ['3', '1']);
}

async function проверитьФильтрациюПоДате(app) {
  const res = await request(app)
    .get('/api/meta')
    .query({ date: '2024-02-01T00:00:00Z' })
    .expect(200);
  assert.strictEqual(res.body.ok, true);
  сравнитьИдентификаторы(res.body.items, ['3', '2']);
}

async function проверитьСортировкуПоНазванию(app) {
  const res = await request(app)
    .get('/api/meta')
    .query({ sort: 'title', order: 'asc' })
    .expect(200);
  assert.strictEqual(res.body.ok, true);
  сравнитьИдентификаторы(res.body.items, ['1', '2', '4', '3']);
}

async function проверитьПагинацию(app) {
  const res = await request(app)
    .get('/api/meta')
    .query({ limit: 2, page: 2 })
    .expect(200);
  assert.strictEqual(res.body.ok, true);
  assert.strictEqual(res.body.page, 2);
  assert.strictEqual(res.body.pageSize, 2);
  assert.strictEqual(res.body.total, ТЕСТОВЫЕ_ДАННЫЕ.length);
  сравнитьИдентификаторы(res.body.items, ['1', '4']);
}

async function проверитьОшибкуISOФормата(app) {
  const res = await request(app)
    .get('/api/meta')
    .query({ date: '2024-01-01' })
    .expect(400);
  assert.strictEqual(res.body.ok, false);
  assert.ok(res.body.error.includes('ISO'));
}

async function run() {
  const восстановить = подготовитьMetaIndex();
  const app = создатьПриложение();

  try {
    await проверитьБазовуюВыборку(app);
    await проверитьФильтрациюПоТегам(app);
    await проверитьФильтрациюПоАвторам(app);
    await проверитьФильтрациюПоДате(app);
    await проверитьСортировкуПоНазванию(app);
    await проверитьПагинацию(app);
    await проверитьОшибкуISOФормата(app);
    console.log('meta_routes тесты пройдены');
  } finally {
    восстановить();
  }
}

run();
