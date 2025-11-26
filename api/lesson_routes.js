const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const { setTimeout: delay } = require('timers/promises');

const router = express.Router();

const DATA_DIR = path.join(__dirname, '..', 'data');
const LESSONS_PATH = path.join(DATA_DIR, 'lessons.json');
const LOCK_PATH = `${LESSONS_PATH}.lock`;
const LOCK_RETRY_DELAY_MS = 100;
const LOCK_MAX_ATTEMPTS = 50;

const STATUS_ENUM = ['planned', 'in_progress', 'done', 'skipped', 'failed'];

async function ensureLessonsFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(LESSONS_PATH);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
    await fs.writeFile(LESSONS_PATH, '[]', 'utf-8');
  }
}

async function acquireLock(attempt = 0) {
  try {
    const handle = await fs.open(LOCK_PATH, 'wx');
    return handle;
  } catch (err) {
    if (err.code === 'EEXIST' && attempt < LOCK_MAX_ATTEMPTS) {
      await delay(LOCK_RETRY_DELAY_MS);
      return acquireLock(attempt + 1);
    }
    const error = new Error('Не удалось получить блокировку для lessons.json');
    error.status = 503;
    throw error;
  }
}

async function withFileLock(fn) {
  await ensureLessonsFile();
  const handle = await acquireLock();
  try {
    return await fn();
  } finally {
    try {
      await handle.close();
    } catch (err) {
      console.error('Ошибка закрытия файла блокировки:', err);
    }
    try {
      await fs.unlink(LOCK_PATH);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error('Ошибка удаления файла блокировки:', err);
      }
    }
  }
}

function normalizeLessons(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    return Object.values(raw);
  }
  return [];
}

async function readLessons() {
  await ensureLessonsFile();
  const content = await fs.readFile(LESSONS_PATH, 'utf-8');
  try {
    const parsed = JSON.parse(content);
    return normalizeLessons(parsed);
  } catch (err) {
    const error = new Error('lessons.json поврежден: ' + err.message);
    error.status = 500;
    throw error;
  }
}

async function atomicWriteLessons(data) {
  const tmpPath = `${LESSONS_PATH}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  const handle = await fs.open(tmpPath, 'w');
  try {
    await handle.writeFile(JSON.stringify(data, null, 2), 'utf-8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(tmpPath, LESSONS_PATH);
}

function validateIsoDate(value) {
  if (typeof value !== 'string') return { ok: false, message: 'date должен быть строкой в формате ISO 8601' };
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || value !== parsed.toISOString()) {
    return { ok: false, message: 'Некорректное значение date, ожидается полный ISO-штамп UTC' };
  }
  return { ok: true, date: value };
}

function validateLessonPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, message: 'Тело запроса должно быть объектом' };
  }

  const { lesson_id, date, status, score, notes } = payload;

  if (typeof lesson_id !== 'string' || !lesson_id.trim()) {
    return { ok: false, message: 'lesson_id обязателен и должен быть непустой строкой' };
  }

  const dateVerdict = validateIsoDate(date);
  if (!dateVerdict.ok) return dateVerdict;

  if (typeof status !== 'string' || !STATUS_ENUM.includes(status)) {
    return { ok: false, message: `status должен быть одним из: ${STATUS_ENUM.join(', ')}` };
  }

  const numericScore = Number(score);
  if (!Number.isFinite(numericScore) || numericScore < 0 || numericScore > 1) {
    return { ok: false, message: 'score должен быть числом от 0 до 1' };
  }

  if (notes !== undefined && typeof notes !== 'string') {
    return { ok: false, message: 'notes должен быть строкой' };
  }

  return {
    ok: true,
    data: {
      lesson_id: lesson_id.trim(),
      date: dateVerdict.date,
      status,
      score: numericScore,
      notes: notes ?? ''
    }
  };
}

function isSameUtcDay(dateString, reference) {
  const parsed = new Date(dateString);
  if (Number.isNaN(parsed.getTime())) return false;
  return (
    parsed.getUTCFullYear() === reference.getUTCFullYear() &&
    parsed.getUTCMonth() === reference.getUTCMonth() &&
    parsed.getUTCDate() === reference.getUTCDate()
  );
}

router.post('/lesson/log', async (req, res) => {
  const verdict = validateLessonPayload(req.body);
  if (!verdict.ok) {
    return res.status(400).json({ ok: false, error: verdict.message });
  }

  try {
    await withFileLock(async () => {
      const lessons = await readLessons();
      const idx = lessons.findIndex((item) => item.lesson_id === verdict.data.lesson_id);
      if (idx >= 0) {
        lessons[idx] = { ...lessons[idx], ...verdict.data };
      } else {
        lessons.push(verdict.data);
      }
      await atomicWriteLessons(lessons);
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error('Ошибка записи журнала уроков:', err);
    const status = err.status || 500;
    return res.status(status).json({ ok: false, error: err.message });
  }
});

router.get('/lesson/today', async (req, res) => {
  const { status } = req.query;
  if (status !== undefined && (!STATUS_ENUM.includes(status))) {
    return res.status(400).json({ ok: false, error: `status должен быть одним из: ${STATUS_ENUM.join(', ')}` });
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  try {
    const lessons = await readLessons();
    const filtered = lessons.filter((item) => {
      const sameDay = isSameUtcDay(item.date, today);
      if (!sameDay) return false;
      if (status) {
        return item.status === status;
      }
      return true;
    });

    return res.json({ ok: true, items: filtered });
  } catch (err) {
    console.error('Ошибка чтения журнала уроков:', err);
    const statusCode = err.status || 500;
    return res.status(statusCode).json({ ok: false, error: err.message });
  }
});

router.get('/lesson/statuses', (_req, res) => {
  res.json({ ok: true, statuses: STATUS_ENUM });
});

module.exports = router;
