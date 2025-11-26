const express = require('express');
const fs = require('fs/promises');
const path = require('path');

const router = express.Router();

const META_DIR = path.join(__dirname, '..', 'data');
const META_INDEX_PATH = path.join(META_DIR, 'meta_index.json');
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

let metaIndexCache = null;

async function ensureMetaIndex() {
  await fs.mkdir(META_DIR, { recursive: true });
  try {
    await fs.access(META_INDEX_PATH);
  } catch (err) {
    if (err && err.code !== 'ENOENT') {
      err.status = 500;
      throw err;
    }
    await fs.writeFile(META_INDEX_PATH, '[]', 'utf-8');
  }
}

async function readMetaIndex() {
  await ensureMetaIndex();
  let stats;
  try {
    stats = await fs.stat(META_INDEX_PATH);
  } catch (err) {
    const error = new Error(`Не удалось прочитать meta_index.json: ${err.message}`);
    error.status = 500;
    throw error;
  }

  if (metaIndexCache && metaIndexCache.mtimeMs === stats.mtimeMs) {
    return metaIndexCache.data;
  }

  const raw = await fs.readFile(META_INDEX_PATH, 'utf-8');
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) {
      throw new Error('meta_index.json должен содержать массив объектов метаданных');
    }
    metaIndexCache = { data, mtimeMs: stats.mtimeMs };
    return data;
  } catch (err) {
    const error = new Error(`meta_index.json поврежден: ${err.message}`);
    error.status = 500;
    throw error;
  }
}

function parseListParam(value) {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => String(item).split(','))
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
  }
  return String(value)
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function validateIsoDate(dateStr) {
  if (dateStr === undefined) {
    return { ok: true, date: null };
  }
  if (typeof dateStr !== 'string') {
    return { ok: false, message: 'Параметр date должен быть строкой в формате ISO' };
  }
  const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
  if (!isoRegex.test(dateStr)) {
    return { ok: false, message: 'Некорректный формат даты, ожидается ISO 8601 (пример: 2024-01-01T00:00:00Z)' };
  }
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, message: 'Не удалось разобрать дату, проверьте значение' };
  }
  return { ok: true, date: parsed };
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item : String(item)))
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    return [value.trim().toLowerCase()].filter(Boolean);
  }
  return [];
}

function matchTags(entryTags, filterTags) {
  if (!filterTags.length) return true;
  const normalizedTags = normalizeStringArray(entryTags);
  return normalizedTags.some((tag) => filterTags.includes(tag));
}

function matchAuthors(entryAuthors, filterAuthors) {
  if (!filterAuthors.length) return true;
  const normalizedAuthors = normalizeStringArray(entryAuthors);
  return normalizedAuthors.some((author) => filterAuthors.includes(author));
}

function filterByDate(entryDate, fromDate) {
  if (!fromDate) return true;
  if (!entryDate) return false;
  const parsed = new Date(entryDate);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed >= fromDate;
}

function sortEntries(entries, sortBy, order) {
  const direction = order === 'asc' ? 1 : -1;
  const sortField = sortBy === 'title' ? 'title' : 'date';
  return [...entries].sort((a, b) => {
    if (sortField === 'date') {
      const dateA = new Date(a.date || 0).getTime();
      const dateB = new Date(b.date || 0).getTime();
      const safeA = Number.isNaN(dateA) ? 0 : dateA;
      const safeB = Number.isNaN(dateB) ? 0 : dateB;
      return (safeA - safeB) * direction;
    }
    const valueA = (a.title || '').toString().toLowerCase();
    const valueB = (b.title || '').toString().toLowerCase();
    if (valueA === valueB) return 0;
    return valueA > valueB ? direction : -direction;
  });
}

router.get('/api/meta', async (req, res) => {
  const { date, tags, authors, page = '1', limit = DEFAULT_PAGE_SIZE, sort = 'date', order = 'desc' } = req.query;

  const dateVerdict = validateIsoDate(date);
  if (!dateVerdict.ok) {
    return res.status(400).json({ ok: false, error: dateVerdict.message });
  }

  const tagFilters = parseListParam(tags);
  const authorFilters = parseListParam(authors);

  const pageNumber = Number.parseInt(page, 10);
  if (Number.isNaN(pageNumber) || pageNumber < 1) {
    return res.status(400).json({ ok: false, error: 'Параметр page должен быть целым числом от 1' });
  }

  const rawLimit = Number.parseInt(limit, 10);
  if (Number.isNaN(rawLimit) || rawLimit < 1) {
    return res.status(400).json({ ok: false, error: 'Параметр limit должен быть положительным целым числом' });
  }
  const pageSize = Math.min(rawLimit, MAX_PAGE_SIZE);

  const sortField = typeof sort === 'string' && ['date', 'title'].includes(sort.toLowerCase()) ? sort.toLowerCase() : 'date';
  const sortOrder = typeof order === 'string' && order.toLowerCase() === 'asc' ? 'asc' : 'desc';

  let metaIndex;
  try {
    metaIndex = await readMetaIndex();
  } catch (err) {
    const statusCode = err.status || 500;
    return res.status(statusCode).json({ ok: false, error: err.message });
  }

  const filtered = metaIndex.filter((item) => {
    const passesDate = filterByDate(item.date, dateVerdict.date);
    const passesTags = matchTags(item.tags, tagFilters);
    const passesAuthors = matchAuthors(item.authors, authorFilters);
    return passesDate && passesTags && passesAuthors;
  });

  const sorted = sortEntries(filtered, sortField, sortOrder);
  const start = (pageNumber - 1) * pageSize;
  const items = sorted.slice(start, start + pageSize);

  return res.json({
    ok: true,
    total: filtered.length,
    page: pageNumber,
    pageSize,
    sortBy: sortField,
    order: sortOrder,
    items,
  });
});

module.exports = router;
