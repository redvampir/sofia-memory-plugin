const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ensure_dir } = require('../../tools/file_utils');

const DEFAULT_FILE_PATH = path.join(__dirname, '..', '..', 'memory', 'memory_usage_log.jsonl');

function normalizeString(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  return String(value);
}

function normalizeStringArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(v => normalizeString(v)).filter(Boolean);
  return String(value)
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
}

function generateId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return crypto.randomBytes(16).toString('hex');
}

function getLogStorageConfig() {
  const mode = (process.env.MEMORY_USAGE_LOG_STORAGE || 'file').toLowerCase();
  const filePath = process.env.MEMORY_USAGE_LOG_PATH || DEFAULT_FILE_PATH;
  const sqlitePath = process.env.MEMORY_USAGE_LOG_DB || path.join(__dirname, '..', '..', 'memory', 'memory_usage_log.db');
  return { mode, filePath, sqlitePath };
}

function buildLogEntry(payload = {}) {
  const timestamp = new Date();
  return {
    id: normalizeString(payload.id, generateId()),
    timestamp: normalizeString(payload.timestamp, timestamp.toISOString()),
    user_id: payload.user_id !== undefined ? normalizeString(payload.user_id) : undefined,
    agent_id: payload.agent_id !== undefined ? normalizeString(payload.agent_id) : undefined,
    project: normalizeString(payload.project, 'default'),
    request_type: normalizeString(payload.request_type, 'get_context'),
    query: normalizeString(payload.query, ''),
    memory_ids: normalizeStringArray(payload.memory_ids),
    outcome: normalizeString(payload.outcome, 'ok'),
    notes: normalizeString(payload.notes, ''),
  };
}

function writeToFile(entry, filePath) {
  ensure_dir(filePath);
  const line = `${JSON.stringify(entry)}\n`;
  return fs.promises.appendFile(filePath, line, 'utf-8');
}

function ensureSqlite(db) {
  return new Promise((resolve, reject) => {
    db.run(
      `CREATE TABLE IF NOT EXISTS memory_usage_logs (
        id TEXT PRIMARY KEY,
        timestamp TEXT,
        user_id TEXT,
        agent_id TEXT,
        project TEXT,
        request_type TEXT,
        query TEXT,
        memory_ids TEXT,
        outcome TEXT,
        notes TEXT
      )`,
      err => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

function writeToSqlite(entry, sqlitePath) {
  let sqlite3;
  try {
    sqlite3 = require('sqlite3').verbose();
  } catch (e) {
    const error = new Error('Для режима SQLite установите зависимость sqlite3');
    error.cause = e;
    return Promise.reject(error);
  }
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(sqlitePath);
    db.serialize(async () => {
      try {
        await ensureSqlite(db);
        const stmt = db.prepare(
          `INSERT INTO memory_usage_logs (id, timestamp, user_id, agent_id, project, request_type, query, memory_ids, outcome, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        stmt.run(
          entry.id,
          entry.timestamp,
          entry.user_id || null,
          entry.agent_id || null,
          entry.project,
          entry.request_type,
          entry.query,
          JSON.stringify(entry.memory_ids || []),
          entry.outcome,
          entry.notes,
          err => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          }
        );
        stmt.finalize();
      } catch (err) {
        reject(err);
      } finally {
        db.close();
      }
    });
  });
}

async function persistLogEntry(entry, config = getLogStorageConfig()) {
  if (config.mode === 'sqlite') {
    await writeToSqlite(entry, config.sqlitePath);
    return entry;
  }
  await writeToFile(entry, config.filePath);
  return entry;
}

async function logMemoryUsage(payload = {}, config) {
  const entry = buildLogEntry(payload);
  await persistLogEntry(entry, config);
  return entry;
}

module.exports = {
  getLogStorageConfig,
  buildLogEntry,
  persistLogEntry,
  logMemoryUsage,
};
