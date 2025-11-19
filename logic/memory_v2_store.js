const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ensure_dir } = require('../tools/file_utils');
const { estimate_cost } = require('../tools/text_utils');

const DEFAULT_STORE_PATH = process.env.MEMORY_V2_STORE || path.join(__dirname, '..', 'memory', 'memory_store.json');
const ALLOWED_STATUSES = ['draft', 'active', 'archived'];

function getStorePath() {
  return DEFAULT_STORE_PATH;
}

function readStore() {
  const filePath = getStorePath();
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function writeStore(data) {
  const filePath = getStorePath();
  ensure_dir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function toArrayOfStrings(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(Boolean);
  return String(value)
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
}

function validatePriority(priority) {
  if (priority === undefined || priority === null) return 1;
  if (!Number.isInteger(priority)) {
    throw new Error('priority должен быть целым числом');
  }
  if (priority < 0 || priority > 3) {
    throw new Error('priority должен быть в диапазоне 0–3');
  }
  return priority;
}

function validateTrust(trust) {
  if (trust === undefined || trust === null) return 1;
  if (typeof trust !== 'number' || Number.isNaN(trust)) {
    throw new Error('trust должен быть числом');
  }
  if (trust < 0 || trust > 1) {
    throw new Error('trust должен быть в диапазоне 0–1');
  }
  return trust;
}

function validateStatus(status) {
  if (!status) return 'active';
  if (typeof status !== 'string') {
    throw new Error('status должен быть строкой');
  }
  if (!ALLOWED_STATUSES.includes(status)) {
    throw new Error(`status должен быть одним из: ${ALLOWED_STATUSES.join(', ')}`);
  }
  return status;
}

function normalizeContent(content) {
  if (content === undefined || content === null) {
    throw new Error('content обязателен');
  }
  if (typeof content === 'string') return content;
  return JSON.stringify(content);
}

function normalizeEntry(payload) {
  const now = new Date().toISOString();
  const normalizedTags = toArrayOfStrings(payload.tags);
  if (!payload.type || typeof payload.type !== 'string') {
    throw new Error('type обязателен и должен быть строкой');
  }
  if (!payload.project || typeof payload.project !== 'string') {
    throw new Error('project обязателен и должен быть строкой');
  }

  const entry = {
    id: payload.id || crypto.randomUUID(),
    type: payload.type.trim(),
    source: (payload.source || 'api').toString(),
    user_id: payload.user_id ? String(payload.user_id) : undefined,
    agent_id: payload.agent_id ? String(payload.agent_id) : undefined,
    project: payload.project.trim(),
    tags: normalizedTags,
    priority: validatePriority(payload.priority),
    trust: validateTrust(payload.trust),
    lang: (payload.lang || 'unknown').toString(),
    status: validateStatus(payload.status),
    created_at: payload.created_at || now,
    updated_at: now,
    content: normalizeContent(payload.content),
  };

  if (payload.deleted) {
    entry.deleted = true;
    entry.deleted_at = now;
  }
  return entry;
}

function upsertEntry(payload) {
  const entry = normalizeEntry(payload);
  const store = readStore();
  const idx = store.findIndex(item => item.id === entry.id);
  if (idx >= 0) {
    const existing = store[idx];
    store[idx] = {
      ...existing,
      ...entry,
      created_at: existing.created_at || entry.created_at,
      updated_at: entry.updated_at,
      deleted: entry.deleted ?? existing.deleted,
      deleted_at: entry.deleted ? entry.deleted_at : existing.deleted_at,
    };
  } else {
    store.push(entry);
  }
  writeStore(store);
  return entry;
}

function filterEntries(entries, filters = {}) {
  const { tags, type, project, lang, status, include_deleted } = filters;
  const tagList = toArrayOfStrings(tags);
  return entries.filter(item => {
    if (!include_deleted && item.deleted) return false;
    if (type && item.type !== type) return false;
    if (project && item.project !== project) return false;
    if (lang && item.lang !== lang) return false;
    if (status && item.status !== status) return false;
    if (tagList.length && !tagList.every(tag => item.tags?.includes(tag))) {
      return false;
    }
    return true;
  });
}

function calculateScore(entry) {
  const updatedAt = Date.parse(entry.updated_at || entry.created_at || Date.now());
  const ageDays = Number.isNaN(updatedAt)
    ? 0
    : (Date.now() - updatedAt) / (1000 * 60 * 60 * 24);
  const freshnessBonus = Math.max(0, 30 - ageDays); // до 30 дней — положительный вклад
  const priorityScore = (entry.priority || 0) * 10;
  return priorityScore + freshnessBonus;
}

function pickByScore(entries, tokenBudget) {
  const sorted = [...entries].sort((a, b) => calculateScore(b) - calculateScore(a));
  const result = [];
  let tokensUsed = 0;
  sorted.forEach(entry => {
    const content = normalizeContent(entry.content);
    const tokens = estimate_cost(content, 'tokens');
    if (tokensUsed + tokens > tokenBudget) return;
    result.push({ ...entry, content, tokens });
    tokensUsed += tokens;
  });
  return { items: result, tokensUsed };
}

function searchEntries(filters = {}) {
  const store = readStore();
  const filtered = filterEntries(store, filters);
  const sorted = filtered.sort((a, b) => calculateScore(b) - calculateScore(a));
  return sorted;
}

module.exports = {
  ALLOWED_STATUSES,
  calculateScore,
  filterEntries,
  pickByScore,
  readStore,
  searchEntries,
  toArrayOfStrings,
  upsertEntry,
  validatePriority,
  validateStatus,
  validateTrust,
};
