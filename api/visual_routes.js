const express = require('express');
const fs = require('fs/promises');
const path = require('path');

const router = express.Router();

const VISUALS_DIR = path.join(__dirname, '..', 'data');
const VISUALS_PATH = path.join(VISUALS_DIR, 'visuals.json');
const ALLOWED_TYPES = ['sketch_reference'];

async function ensureStorage() {
  await fs.mkdir(VISUALS_DIR, { recursive: true });
  try {
    await fs.access(VISUALS_PATH);
  } catch (err) {
    if (err && err.code !== 'ENOENT') {
      throw err;
    }
    await fs.writeFile(VISUALS_PATH, '[]', 'utf-8');
  }
}

async function readVisuals() {
  await ensureStorage();
  const raw = await fs.readFile(VISUALS_PATH, 'utf-8');
  try {
    const data = JSON.parse(raw || '[]');
    if (!Array.isArray(data)) {
      throw new Error('visuals.json должен содержать массив объектов');
    }
    return data;
  } catch (err) {
    const parseError = new Error(`visuals.json поврежден: ${err.message}`);
    parseError.status = 500;
    throw parseError;
  }
}

async function writeVisuals(data) {
  await fs.writeFile(VISUALS_PATH, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
}

function normalizeTags(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((tag) => (typeof tag === 'string' ? tag : String(tag)))
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
  return [];
}

function isValidUrl(value) {
  try {
    const url = new URL(value);
    return Boolean(url.href);
  } catch (_err) {
    return false;
  }
}

function validatePayload(body) {
  const errors = [];
  const type = typeof body.type === 'string' ? body.type.trim().toLowerCase() : '';
  const scene = typeof body.scene === 'string' ? body.scene.trim() : '';
  const image = typeof body.image === 'string' ? body.image.trim() : '';
  const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
  const tags = normalizeTags(body.tags);

  if (!type) {
    errors.push('Поле type обязательно');
  } else if (!ALLOWED_TYPES.includes(type)) {
    errors.push(`Недопустимый type. Разрешено: ${ALLOWED_TYPES.join(', ')}`);
  }

  if (!scene) {
    errors.push('Поле scene обязательно и должно быть непустой строкой');
  }

  if (!image) {
    errors.push('Поле image обязательно и должно содержать URL');
  } else if (!isValidUrl(image)) {
    errors.push('Поле image должно быть валидным URL');
  }

  return {
    isValid: errors.length === 0,
    errors,
    payload: { type, scene, image, notes, tags },
  };
}

function filterByTags(entryTags, filterTags) {
  if (!filterTags.length) return true;
  if (!Array.isArray(entryTags) || !entryTags.length) return false;

  const entryNormalized = entryTags
    .map((tag) => (typeof tag === 'string' ? tag.trim() : String(tag).trim()))
    .filter(Boolean)
    .map((tag) => tag.toLowerCase());
  const filtersNormalized = filterTags.map((tag) => tag.toLowerCase());

  return entryNormalized.some((tag) => filtersNormalized.includes(tag));
}

router.post('/visuals', async (req, res) => {
  const validation = validatePayload(req.body || {});

  if (!validation.isValid) {
    console.warn('[VISUALS] Ошибка валидации при создании записи:', validation.errors.join('; '));
    return res.status(400).json({ ok: false, errors: validation.errors });
  }

  const visualsEntry = {
    ...validation.payload,
    created_at: new Date().toISOString(),
  };

  try {
    const visuals = await readVisuals();
    visuals.push(visualsEntry);
    await writeVisuals(visuals);
    console.log(`[VISUALS] Добавлена запись для сцены "${visualsEntry.scene}"`);
    return res.status(201).json({ ok: true, item: visualsEntry });
  } catch (err) {
    console.error('[VISUALS] Ошибка сохранения записи:', err.message);
    const status = err.status || 500;
    return res.status(status).json({ ok: false, error: 'Не удалось сохранить запись, попробуйте позже' });
  }
});

router.get('/visuals', async (req, res) => {
  const sceneFilter = typeof req.query.scene === 'string' ? req.query.scene.trim() : '';
  const typeFilter = typeof req.query.type === 'string' ? req.query.type.trim().toLowerCase() : '';
  const tagFilters = normalizeTags(req.query.tags).map((tag) => tag.trim());

  try {
    const visuals = await readVisuals();
    const filtered = visuals.filter((item) => {
      const byScene = sceneFilter ? String(item.scene || '').trim() === sceneFilter : true;
      const byType = typeFilter ? String(item.type || '').trim().toLowerCase() === typeFilter : true;
      const byTags = filterByTags(item.tags, tagFilters);
      return byScene && byType && byTags;
    });
    console.log(`[VISUALS] Запрошен список: найдено ${filtered.length} записей`);
    return res.json({ ok: true, total: filtered.length, items: filtered });
  } catch (err) {
    console.error('[VISUALS] Ошибка чтения записей:', err.message);
    const status = err.status || 500;
    return res.status(status).json({ ok: false, error: 'Не удалось прочитать список визуальных ссылок' });
  }
});

module.exports = router;
