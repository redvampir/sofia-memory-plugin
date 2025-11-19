const express = require('express');
const { checkAccess } = require('../utils/access_control');
const {
  upsertEntry,
  searchEntries,
  pickByScore,
  filterEntries,
  ALLOWED_STATUSES,
} = require('../logic/memory_v2_store');
const { estimate_cost } = require('../tools/text_utils');

const router = express.Router();

function validateArray(value, fieldName) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} должен быть массивом строк`);
  }
  const sanitized = value.map(v => String(v).trim()).filter(Boolean);
  return sanitized;
}

function validateStoreBody(body = {}) {
  const required = ['type', 'project', 'content'];
  const missing = required.filter(key => body[key] === undefined || body[key] === null);
  if (missing.length) {
    throw new Error(`Отсутствуют обязательные поля: ${missing.join(', ')}`);
  }
  if (body.priority !== undefined && !Number.isInteger(body.priority)) {
    throw new Error('priority должен быть целым числом');
  }
  if (body.priority !== undefined && (body.priority < 0 || body.priority > 3)) {
    throw new Error('priority должен быть в диапазоне 0–3');
  }
  if (body.trust !== undefined && (typeof body.trust !== 'number' || body.trust < 0 || body.trust > 1)) {
    throw new Error('trust должен быть числом от 0 до 1');
  }
  if (body.status && !ALLOWED_STATUSES.includes(body.status)) {
    throw new Error(`status должен быть одним из: ${ALLOWED_STATUSES.join(', ')}`);
  }
  if (body.tags !== undefined) validateArray(body.tags, 'tags');
}

function resolveStatusCode(error, fallback = 400) {
  if (error?.statusCode) return error.statusCode;
  if (error?.code === 'MEMORY_ENTRY_TOO_LARGE') return 413;
  return fallback;
}

router.post('/memory/store', async (req, res) => {
  try {
    validateStoreBody(req.body || {});
  } catch (e) {
    return res.status(400).json({ status: 'error', message: e.message });
  }

  const access = checkAccess('memory/memory_store.json', 'write');
  if (!access.allowed) {
    return res.status(403).json({ status: 'error', message: access.message });
  }

  try {
    const entry = upsertEntry(req.body || {});
    return res.json({ status: 'ok', entry });
  } catch (e) {
    const status = resolveStatusCode(e);
    return res.status(status).json({ status: 'error', message: e.message });
  }
});

router.post('/memory/search', (req, res) => {
  try {
    const filters = req.body || {};
    const { tags, type, project, lang, status, include_deleted } = filters;
    if (status && !ALLOWED_STATUSES.includes(status)) {
      return res
        .status(400)
        .json({ status: 'error', message: `status должен быть одним из: ${ALLOWED_STATUSES.join(', ')}` });
    }
    if (tags !== undefined) validateArray(tags, 'tags');

    const access = checkAccess('memory/memory_store.json', 'read');
    if (!access.allowed) {
      return res.status(403).json({ status: 'error', message: access.message });
    }

    const results = searchEntries({ tags, type, project, lang, status, include_deleted });
    return res.json({ status: 'ok', items: results });
  } catch (e) {
    const status = resolveStatusCode(e);
    return res.status(status).json({ status: 'error', message: e.message });
  }
});

router.post('/memory/get_context', (req, res) => {
  try {
    const { token_budget, tags, type, project, lang, status } = req.body || {};
    const budget = Number(token_budget);
    if (!Number.isFinite(budget) || budget <= 0) {
      return res.status(400).json({ status: 'error', message: 'token_budget должен быть положительным числом' });
    }
    if (status && !ALLOWED_STATUSES.includes(status)) {
      return res
        .status(400)
        .json({ status: 'error', message: `status должен быть одним из: ${ALLOWED_STATUSES.join(', ')}` });
    }
    if (tags !== undefined) validateArray(tags, 'tags');

    const access = checkAccess('memory/memory_store.json', 'read');
    if (!access.allowed) {
      return res.status(403).json({ status: 'error', message: access.message });
    }

    const filtered = filterEntries(searchEntries(), { tags, type, project, lang, status });
    const { items, tokensUsed } = pickByScore(filtered, budget);
    const remaining = Math.max(budget - tokensUsed, 0);
    const total_tokens = filtered.reduce((acc, item) => acc + estimate_cost(String(item.content || ''), 'tokens'), 0);
    return res.json({
      status: 'ok',
      tokens_used: tokensUsed,
      token_budget: budget,
      remaining_budget: remaining,
      total_tokens,
      items,
    });
  } catch (e) {
    const status = resolveStatusCode(e);
    return res.status(status).json({ status: 'error', message: e.message });
  }
});

module.exports = router;
