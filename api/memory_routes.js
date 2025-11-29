// Маршруты API для работы с хранилищем памяти
const express = require('express');
const path = require('path');
const fs = require('fs');
const github = require('../tools/github_client');
const router = express.Router();
const { checkAccess } = require('../utils/access_control');

const {
  writeFileSafe,
  updateOrInsertJsonEntry,
  updateIndexEntry,
  updatePlan,
  rebuildIndex,
  updateIndexFileManually,
  contextFilename,
  planFilename,
  indexFilename,
} = require('../logic/memory_operations');
const index_manager = require('../logic/index_manager');
const memory_config = require('../tools/memory_config');
const token_store = require('../tools/token_store');
const { setMemoryMode, getMemoryMode } = require('../utils/memory_mode');
const { generateTitleFromPath, inferTypeFromPath, normalize_memory_path, ensure_dir } = require('../tools/file_utils');
const { parseMarkdownStructure, mergeMarkdownTrees, serializeMarkdownTree } = require('../logic/markdown_merge_engine');
const { getRepoInfo, extractToken, categorizeMemoryFile, logDebug } = require('../tools/memory_helpers');
const { logError } = require('../tools/error_handler');
const { readMarkdownFile } = require('../src/memory');
const { saveReferenceAnswer } = require('../src/memory');
const { load_memory_to_context, load_context_from_index } = require('../src/memory');
const logger = require('../utils/logger');
const { restoreContext } = require('../utils/restore_context');
const { resolveUserId, getDefaultUserId } = require('../utils/default_user');
const { Octokit } = require('@octokit/rest');
const { decodeContent } = require('../tools/content_utils');
const LOCAL_GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const ALLOW_INSECURE_LOCAL = process.env.ALLOW_INSECURE_LOCAL === '1';
const index_tree = require('../tools/index_tree');

const remoteMetadataCache = new Map();
const defaultBranchCache = new Map();
const TTL_FROM_ENV = Number.parseInt(process.env.MEMORY_METADATA_TTL_MS || '', 10);
const METADATA_TTL_MS = Number.isFinite(TTL_FROM_ENV) && TTL_FROM_ENV > 0 ? TTL_FROM_ENV : 5 * 60 * 1000;

function maskValue(value) {
  if (!value) return undefined;
  if (typeof value !== 'string') return '[masked]';
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (/bearer\s+/i.test(trimmed)) return 'Bearer ***';
  if (trimmed.length <= 8) return '***';
  return `${trimmed.slice(0, 4)}***${trimmed.slice(-2)}`;
}

function sanitizeHeaders(headers) {
  return {
    'content-type': headers['content-type'],
    authorization: maskValue(headers.authorization),
  };
}

function shorten(value) {
  if (typeof value !== 'string') return value;
  const limit = 300;
  return value.length > limit ? `${value.slice(0, limit)}... (truncated)` : value;
}

function normalizeRepo(repo) {
  if (!repo) return repo;
  const match = repo.match(/github\.com[:\/](.+?)(?:\.git)?$/);
  return match ? match[1] : repo;
}

function sanitizeBody(body) {
  if (!body || typeof body !== 'object') return body;
  const safe = {};
  for (const [key, val] of Object.entries(body)) {
    const lower = key.toLowerCase();
    if (/(token|auth|password|secret|authorization)/.test(lower)) {
      safe[key] = '[masked]';
      continue;
    }
    if (typeof val === 'string') {
      safe[key] = shorten(val);
    } else if (Array.isArray(val)) {
      safe[key] = val.map(item => (typeof item === 'string' ? shorten(item) : item));
    } else if (val && typeof val === 'object') {
      safe[key] = '[object]';
    } else {
      safe[key] = val;
    }
  }
  return safe;
}

function parseRangeParam(raw) {
  if (raw === undefined || raw === null || raw === '') return { ok: true, range: null };
  if (typeof raw !== 'string') {
    return { ok: false, message: 'range должен быть строкой формата start:bytes' };
  }
  const match = raw.trim().match(/^(\d+):(\d+)$/);
  if (!match) {
    return { ok: false, message: 'Неверный формат range. Используйте start:bytes' };
  }
  const start = Number.parseInt(match[1], 10);
  const bytes = Number.parseInt(match[2], 10);
  if (Number.isNaN(start) || Number.isNaN(bytes)) {
    return { ok: false, message: 'Неверный формат range: требуется start:bytes' };
  }
  if (start < 0) {
    return { ok: false, message: 'Начало диапазона должно быть >= 0' };
  }
  if (bytes <= 0) {
    return { ok: false, message: 'Размер диапазона должен быть больше 0' };
  }
  return { ok: true, range: { start, bytes, end: start + bytes - 1 } };
}

function getCacheKey(owner, repoName, filename, ref) {
  return `${owner}/${repoName}:${filename || ''}@${ref || ''}`;
}

function getCachedMeta(owner, repoName, filename, ref) {
  const key = getCacheKey(owner, repoName, filename, ref);
  const entry = remoteMetadataCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > METADATA_TTL_MS) {
    remoteMetadataCache.delete(key);
    return null;
  }
  return entry;
}

function setCachedMeta(owner, repoName, filename, ref, meta) {
  const key = getCacheKey(owner, repoName, filename, ref);
  const prev = remoteMetadataCache.get(key) || {};
  const merged = { ...prev, ...meta, fetchedAt: Date.now() };
  if (meta && meta.encoding === undefined && prev && prev.encoding !== undefined) {
    merged.encoding = prev.encoding;
  }
  remoteMetadataCache.set(key, merged);
  return merged;
}

function getCachedDefaultBranch(owner, repoName) {
  const key = `${owner}/${repoName}`;
  const entry = defaultBranchCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > METADATA_TTL_MS) {
    defaultBranchCache.delete(key);
    return null;
  }
  return entry.branch;
}

function setCachedDefaultBranch(owner, repoName, branch) {
  const key = `${owner}/${repoName}`;
  defaultBranchCache.set(key, { branch, fetchedAt: Date.now() });
}

function updateCachedEncoding(owner, repoName, filename, ref, encoding, meta = {}) {
  if (!encoding) return;
  setCachedMeta(owner, repoName, filename, ref, { ...meta, encoding });
}

function summarizePayload(payload) {
  const sanitized = sanitizeBody(payload);
  if (sanitized === undefined) return 'undefined';
  if (sanitized === null) return 'null';
  if (typeof sanitized === 'string') return shorten(sanitized);
  try {
    const stringified = JSON.stringify(sanitized);
    return shorten(stringified);
  } catch (e) {
    logger.error('[summarizePayload]', e.stack || e.message);
    return '[unserializable]';
  }
}

function logRequest(req) {
  logger.info('[request]', {
    method: req.method,
    path: req.originalUrl || req.url,
    headers: sanitizeHeaders(req.headers || {}),
    body: sanitizeBody(req.body || {}),
  });
}

function createResponder(req, res) {
  return (ok, payload, statusCode = 200) => {
    const body = ok
      ? { ok: true, data: payload === undefined ? null : payload }
      : {
          ok: false,
          error:
            typeof payload === 'string'
              ? payload
              : payload?.error || payload?.message || 'Неизвестная ошибка',
          ...(payload && payload.details ? { details: payload.details } : {}),
        };

    logger.info('[response]', {
      method: req.method,
      path: req.originalUrl || req.url,
      status: statusCode,
      body: summarizePayload(body),
    });
    return res.status(statusCode).json(body);
  };
}

function methodNotAllowed(res, allowedMethods) {
  const allow = Array.isArray(allowedMethods) ? allowedMethods : [allowedMethods];
  res.setHeader('Allow', allow.join(', '));
  return res
    .status(405)
    .json({ status: 'error', message: `Method not allowed. Use ${allow.join(', ')}.` });
}

function validateLocalAuth(req) {
  if (ALLOW_INSECURE_LOCAL) return { ok: true };
  if (!LOCAL_GITHUB_TOKEN) {
    logger.error('[auth] GITHUB_TOKEN is not set for local mode');
    return { ok: false, status: 401, message: 'Некорректный GitHub token' };
  }
  return { ok: true };
}

function ensureLocalAuth(req, res, respond) {
  const verdict = validateLocalAuth(req);
  if (!verdict.ok) {
    respond(false, verdict.message, verdict.status || 401);
    return false;
  }
  return true;
}

function normalizeMemoryBody(body = {}) {
  const {
    id,
    type,
    version,
    data,
    filename,
    content,
    fileName,
    file_path,
    filePath,
    ...rest
  } = body || {};

  const normalizedFilename = filename || fileName || filePath || file_path || id;
  let normalizedContent = content;

  if (normalizedContent === undefined && data !== undefined) {
    normalizedContent = typeof data === 'string' ? data : JSON.stringify(data);
  }

  return {
    filename: normalizedFilename,
    content: normalizedContent,
    type,
    version,
    data,
    ...rest,
  };
}

function log_restore_action(user_id, success) {
  if (success) {
    logger.info(`Контекст восстановлен для пользователя: ${user_id}`);
  } else {
    logger.error(`Ошибка восстановления контекста для пользователя: ${user_id}`);
  }
}

function get_context_for_user(userId) {
  try {
    const data = fs.readFileSync(contextFilename(userId), 'utf-8');
    return data.trim();
  } catch {
    return '';
  }
}

async function restore_user_context(user_id) {
  try {
    await restoreContext(user_id);
    log_restore_action(user_id, true);
  } catch (e) {
    log_restore_action(user_id, false);
    logger.error('[restore_user_context]', e.message);
  }
}

async function check_context_for_user(user_id) {
  const context = get_context_for_user(user_id);
  if (!context) {
    await restore_user_context(user_id);
  }
}

async function readLocalFileChunk(filePath, range) {
  const stats = await fs.promises.stat(filePath);
  const size = stats.size;
  if (size === 0) {
    if (range) {
      const err = new Error('Диапазон выходит за пределы файла');
      err.status = 416;
      throw err;
    }
    return { buffer: Buffer.alloc(0), size, chunkStart: 0, chunkEnd: -1 };
  }
  const chunkStart = range ? range.start : 0;
  if (chunkStart >= size && size > 0) {
    const err = new Error('Диапазон выходит за пределы файла');
    err.status = 416;
    throw err;
  }
  const chunkEnd = size === 0 ? -1 : range ? Math.min(range.end, size - 1) : size - 1;
  const stream = fs.createReadStream(filePath, {
    start: chunkStart,
    end: chunkEnd,
  });

  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  const buffer = chunks.length ? Buffer.concat(chunks) : Buffer.alloc(0);
  return { buffer, size, chunkStart, chunkEnd };
}

async function resolveGithubRef(octokit, owner, repoName, providedRef) {
  if (providedRef) return providedRef;
  const cached = getCachedDefaultBranch(owner, repoName);
  if (cached) return cached;
  try {
    const repoInfo = await octokit.repos.get({ owner, repo: repoName });
    const branch = repoInfo?.data?.default_branch;
    if (branch) {
      setCachedDefaultBranch(owner, repoName, branch);
      return branch;
    }
  } catch (e) {
    logger.warn('[resolveGithubRef] Не удалось получить default branch', e.message);
  }
  return undefined;
}

async function fetchGithubMetadata(octokit, owner, repoName, normalizedFilename, ref) {
  const cached = getCachedMeta(owner, repoName, normalizedFilename, ref);
  if (cached) return cached;
  try {
    const meta = await octokit.repos.getContent({ owner, repo: repoName, path: normalizedFilename, ref });
    const size = meta?.data?.size;
    const etag = meta?.headers?.etag || null;
    if (Number.isFinite(size)) {
      const result = { size, etag, ref: meta?.data?.sha || ref || null };
      setCachedMeta(owner, repoName, normalizedFilename, ref, result);
      return result;
    }
  } catch (e) {
    logger.warn('[fetchGithubMetadata] Не удалось получить метаданные', e.message);
  }
  return null;
}

async function readGithubFileChunk(token, repo, normalizedFilename, range, ref) {
  const normalizedRepo = normalizeRepo(repo);
  const [owner, repoName] = (normalizedRepo || '').split('/');
  const octokit = new Octokit({ auth: token, userAgent: 'sofia-memory-plugin' });

  const effectiveRef = await resolveGithubRef(octokit, owner, repoName, ref);
  const meta = await fetchGithubMetadata(octokit, owner, repoName, normalizedFilename, effectiveRef);

  if (range && meta && Number.isFinite(meta.size) && meta.size >= 0) {
    if (meta.size === 0) {
      const err = new Error('Диапазон выходит за пределы файла');
      err.status = 416;
      throw err;
    }
    if (range.start >= meta.size) {
      const err = new Error('Диапазон выходит за пределы файла');
      err.status = 416;
      throw err;
    }
  }

  const headers = { Accept: 'application/vnd.github.raw' };
  if (range) headers.Range = `bytes=${range.start}-${range.end}`;

  try {
    const response = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
      owner,
      repo: repoName,
      path: normalizedFilename,
      ref: effectiveRef,
      headers,
    });
    const rawData = response.data || '';
    const buffer = Buffer.isBuffer(rawData) ? rawData : Buffer.from(rawData);
    const rangeHeader = response.headers['content-range'];
    const lengthHeader = Number.parseInt(response.headers['content-length'] || '0', 10);
    const cachedSize = meta?.size;
    let size = Number.isFinite(lengthHeader) && range ? cachedSize ?? null : cachedSize ?? buffer.length;
    let chunkStart = range ? range.start : 0;
    let chunkEnd = range ? range.start + buffer.length - 1 : buffer.length - 1;

    if (rangeHeader) {
      const match = rangeHeader.match(/bytes\s+(\d+)-(\d+)\/(\d+)/);
      if (match) {
        chunkStart = Number.parseInt(match[1], 10);
        chunkEnd = Number.parseInt(match[2], 10);
        size = Number.parseInt(match[3], 10);
      }
    }

    if (size === null || Number.isNaN(size)) {
      size = buffer.length;
    }

    if (range && size === 0) {
      const err = new Error('Диапазон выходит за пределы файла');
      err.status = 416;
      throw err;
    }
    if (range && size > 0 && range.start >= size) {
      const err = new Error('Диапазон выходит за пределы файла');
      err.status = 416;
      throw err;
    }

    if (range && !rangeHeader && buffer.length > range.bytes) {
      const sliceEnd = Math.min(range.bytes, buffer.length);
      const sliced = buffer.subarray(0, sliceEnd);
      return { buffer: sliced, size, chunkStart, chunkEnd: chunkStart + sliced.length - 1 };
    }

    if (meta?.etag) {
      setCachedMeta(owner, repoName, normalizedFilename, effectiveRef, meta);
    }

    return {
      buffer,
      size,
      chunkStart,
      chunkEnd,
      owner,
      repoName,
      ref: effectiveRef,
      meta,
    };
  } catch (e) {
    if (e.status === 416) {
      e.message = e.message || 'Диапазон выходит за пределы файла';
    }
    throw e;
  }
}

async function process_users_in_batches(users) {
  const batch_size = 10;
  for (let i = 0; i < users.length; i += batch_size) {
    const batch = users.slice(i, i + batch_size);
    for (const id of batch) {
      await check_context_for_user(id);
    }
  }
}

async function check_context_periodically() {
  const users = await memory_config.getAllUsers();
  if (!users.length) users.push(getDefaultUserId());
  await process_users_in_batches(users);
}

const contextCheckTimer = setInterval(check_context_periodically, 30 * 60 * 1000);
if (contextCheckTimer && typeof contextCheckTimer.unref === 'function') {
  contextCheckTimer.unref();
}

async function setMemoryRepo(req, res) {
  const { repoUrl, userId } = req.body;
  await memory_config.setRepoUrl(userId, repoUrl);
  res.json({ status: 'success', repo: repoUrl });
}

async function setMemoryModeRoute(req, res) {
  const { userId, mode } = req.body || {};
  const val = (mode || '').toLowerCase();
  if (!['local', 'github'].includes(val)) {
    return res.status(400).json({ status: 'error', message: 'Invalid mode' });
  }
  await setMemoryMode(resolveUserId(userId), val);
  res.json({ status: 'success', mode: val });
}

async function systemStatus(req, res) {
  const userId = resolveUserId((req.query.userId || (req.body || {}).userId || '').toString());
  const mode = (await getMemoryMode(userId)) || 'github';
  const repo = (await memory_config.getRepoUrl(userId)) || null;

  res.json({ status: 'ok', mode, repo });
}

async function saveMemory(req, res) {
  logRequest(req);
  const respond = createResponder(req, res);

  const { repo, filename, content, userId } = normalizeMemoryBody(req.body);
  const token = await extractToken(req);
  const { repo: effectiveRepo, token: effectiveToken } = await getRepoInfo(filename, userId, repo, token);

  if (!effectiveRepo) {
    if (!ensureLocalAuth(req, res, respond)) return;
  }

  if (!filename || content === undefined) {
    return respond(false, '?? ??????? ???????????? ?????: id/filename ??? data/content.');
  }

  const needsGithub = Boolean(effectiveRepo);
  if (needsGithub) {
    if (!effectiveToken) {
      return respond(false, '??????????? GitHub token');
    }
    try {
      const check = await github.validateToken(effectiveToken);
      if (!check.valid) {
        return respond(false, '???????????? GitHub token');
      }
    } catch (e) {
      logger.error('[saveMemory validateToken]', e.stack || e.message);
      logError('validateToken', e);
      return respond(false, '???????????? GitHub token');
    }
    try {
      const { exists, status } = await github.repoExistsSafe(
        effectiveToken,
        effectiveRepo
      );
      if (!exists) {
        if (status === 401) {
          return respond(false, '???????????? GitHub token');
        }
        if (status === 403) {
          return respond(false, '?????? ???????? ? ???????????.');
        }
        const unavailable = status === 503 ? 503 : 200;
        return respond(false, '??????????? ??????????.', unavailable);
      }
    } catch (e) {
      logger.error('[saveMemory repoExistsSafe]', e.stack || e.message);
      logError('repoExists', e);
      const unavailable = e.status === 503 ? 503 : 200;
      return respond(false, '??????????? ??????????.', unavailable);
    }
  }

  const normalizedFilename = normalize_memory_path(filename);
  const filePath = path.join(__dirname, '..', normalizedFilename);
  ensure_dir(filePath);

  let finalContent = content;
  const isMarkdown = normalizedFilename.endsWith('.md');
  const isJson = normalizedFilename.endsWith('.json');
  if (isMarkdown) {
    try {
      let existing = '';
      if (effectiveRepo && effectiveToken) {
        try {
          existing = await fs.promises.readFile(filePath, 'utf-8');
        } catch {}
        try {
          existing = await github.readFile(effectiveToken, effectiveRepo, normalizedFilename);
        } catch (e) {
          logDebug('[saveMemory] no remote file', e.message);
        }
      } else if (fs.existsSync(filePath)) {
        existing = fs.readFileSync(filePath, 'utf-8');
      }
      if (existing) {
        const baseTree = parseMarkdownStructure(existing);
        const newTree = parseMarkdownStructure(content);
        const merged = mergeMarkdownTrees(baseTree, newTree, { dedupe: true });
        finalContent = serializeMarkdownTree(merged);
      }
    } catch (e) {
      logger.error('[saveMemory markdown merge]', e.stack || e.message);
      logError('saveMemory markdown merge', e);
    }
  }

  let handledAsJson = false;
  if (isJson) {
    try {
      const data = typeof finalContent === 'string' ? JSON.parse(finalContent) : finalContent;
      await updateOrInsertJsonEntry(
        filePath,
        data,
        null,
        effectiveRepo,
        effectiveToken
      );
      handledAsJson = true;
    } catch (e) {
      logger.info('[saveMemory json fallback]', e.message || e.stack);
      logError('saveMemory invalid JSON, fallback to text', e);
      handledAsJson = false;
    }
  }

  if (!handledAsJson) {
    try {
      await writeFileSafe(filePath, finalContent);
    } catch (e) {
      logger.error('[saveMemory writeFileSafe]', e.stack || e.message);
      const unavailable = e.status === 503 ? 503 : 200;
      return respond(false, { error: e.message, details: e.githubMessage }, unavailable);
    }

    if (needsGithub) {
      const access = checkAccess(normalizedFilename, 'write');
      if (!access.allowed) {
        logError('access denied', new Error(access.message));
        logger.error('[saveMemory access denied]', access.message);
        return respond(false, access.message);
      }
      try {
        await github.writeFileSafe(
          effectiveToken,
          effectiveRepo,
          normalizedFilename,
          finalContent,
          `update ${filename}`
        );
      } catch (e) {
        logError('GitHub write', e);
        logger.error('[saveMemory github write]', e.stack || e.message);
        const unavailable = e.status === 503 ? 503 : 200;
        return respond(false, { error: e.message, details: e.githubMessage }, unavailable);
      }
    }
  }

  const meta = fs.existsSync(filePath) ? fs.statSync(filePath) : { mtime: new Date() };
  try {
    await updateIndexEntry(
      effectiveRepo,
      effectiveToken,
      {
        path: normalizedFilename,
        type: categorizeMemoryFile(path.basename(normalizedFilename)),
        title: generateTitleFromPath(normalizedFilename),
        description: '',
        lastModified: meta.mtime.toISOString(),
      },
      userId
    );
  } catch (e) {
    logger.error('[saveMemory updateIndexEntry]', e.stack || e.message);
    const unavailable = e.status === 503 ? 503 : 200;
    return respond(false, { error: e.message, details: e.githubMessage }, unavailable);
  }

  if (normalizedFilename.startsWith('memory/') && normalizedFilename !== 'memory/index.json') {
    try {
      await index_manager.addOrUpdateEntry({
        path: normalizedFilename,
        title: generateTitleFromPath(normalizedFilename),
        type: inferTypeFromPath(normalizedFilename),
        lastModified: new Date().toISOString(),
      });
      await index_manager.saveIndex(effectiveToken, effectiveRepo, userId);
    } catch (e) {
      logger.error('[saveMemory index_manager save]', e.stack || e.message);
      const unavailable = e.status === 503 ? 503 : 200;
      return respond(false, { error: e.message, details: e.githubMessage }, unavailable);
    }
  }

  return respond(true, { action: 'saveMemory', filePath: normalizedFilename });
}

async function saveAnswer(req, res) {
  const { key, content, repo, userId } = req.body;
  const token = await extractToken(req);
  if (!key || content === undefined) {
    return res.status(400).json({ status: 'error', message: 'Missing key or content' });
  }
  try {
    const { repo: r, token: t } = await getRepoInfo(`memory/answers/${key}.md`, userId, repo, token);
    await saveReferenceAnswer(r, t, key, content);
    res.json({ status: 'success', path: `memory/answers/${key}.md` });
  } catch (e) {
    const code = e.status || 500;
    res.status(code).json({ status: code, message: e.message, detail: e.githubMessage });
  }
}

async function readMemory(req, res) {
  logRequest(req);
  const respond = createResponder(req, res);

  const { repo, filename, userId, range: rangeRaw, ref } = normalizeMemoryBody(req.body);
  const token = await extractToken(req);
  const { repo: effectiveRepo, token: effectiveToken, ref: defaultRef } = await getRepoInfo(
    filename,
    userId,
    repo,
    token,
    ref
  );
  const effectiveRef = ref || defaultRef || undefined;

  const normalizedFilename = normalize_memory_path(filename);
  const filePath = path.join(__dirname, '..', normalizedFilename);
  const isJson = normalizedFilename.endsWith('.json');
  const rangeResult = parseRangeParam(rangeRaw);

  if (!rangeResult.ok) {
    return respond(false, rangeResult.message, 400);
  }

  const range = rangeResult.range;

  if (effectiveRepo) {
    if (!effectiveToken) return respond(false, 'Отсутствует GitHub token', 401);
    try {
      const { buffer, size, chunkStart, chunkEnd, owner, repoName, ref: appliedRef, meta } =
        await readGithubFileChunk(
          effectiveToken,
          effectiveRepo,
          normalizedFilename,
          range,
          effectiveRef
        );
      const hintEncoding = meta?.encoding;
      let decoded;
      if (hintEncoding === 'base64') {
        decoded = { content: buffer.toString('base64'), encoding: 'base64' };
      } else if (hintEncoding === 'utf-8') {
        decoded = { content: buffer.toString('utf-8'), encoding: 'utf-8' };
      } else {
        decoded = decodeContent(buffer, normalizedFilename);
      }
      const { content, encoding } = decoded;
      if (owner && repoName && encoding) {
        updateCachedEncoding(owner, repoName, normalizedFilename, appliedRef, encoding, meta || {});
      }
      let json = null;
      if (isJson && encoding === 'utf-8') {
        try {
          json = JSON.parse(content);
        } catch (e) {
          logger.error('[readMemory parse json remote]', e.stack || e.message);
          logError('readMemory parse json', e);
          return respond(false, 'Не удалось разобрать JSON');
        }
      }
      const truncated = size > 0 ? chunkEnd < size - 1 : false;
      return respond(true, {
        status: 'success',
        file: normalizedFilename,
        size,
        chunkStart,
        chunkEnd,
        truncated,
        content,
        encoding,
        ...(json !== null ? { json } : {}),
        ...(appliedRef ? { ref: appliedRef } : effectiveRef ? { ref: effectiveRef } : {}),
      });
    } catch (e) {
      logger.error('[readMemory remote]', e.stack || e.message);
      const code = e.status || (e.message && /range/i.test(e.message) ? 416 : 200);
      const unavailable = code === 503 ? 503 : code;
      return respond(false, { error: e.message, details: e.githubMessage }, unavailable);
    }
  }

  if (!fs.existsSync(filePath)) {
    return respond(true, {
      status: 'not_found',
      file: normalizedFilename,
      size: 0,
      chunkStart: 0,
      chunkEnd: -1,
      truncated: false,
      content: null,
      encoding: 'utf-8',
    });
  }

  try {
    const { buffer, size, chunkStart, chunkEnd } = await readLocalFileChunk(filePath, range);
    const { content, encoding } = decodeContent(buffer, normalizedFilename);
    let json = null;
    if (isJson && encoding === 'utf-8') {
      try {
        json = JSON.parse(content);
      } catch (e) {
        logger.error('[readMemory parse json local]', e.stack || e.message);
        logError('readMemory parse json', e);
        return respond(false, 'Не удалось разобрать JSON');
      }
    }
    const truncated = size > 0 ? chunkEnd < size - 1 : false;
    return respond(true, {
      status: 'success',
      file: normalizedFilename,
      size,
      chunkStart,
      chunkEnd,
      truncated,
      content,
      encoding,
      ...(json !== null ? { json } : {}),
    });
  } catch (e) {
    logger.error('[readMemory local]', e.stack || e.message);
    const code = e.status === 416 ? 416 : 500;
    return respond(false, e.message || 'Не удалось прочитать файл', code);
  }
}

async function readFileRoute(req, res) {
  const { repo, filename, userId } = req.body || {};
  const token = await extractToken(req);
  const { repo: effectiveRepo, token: effectiveToken } = await getRepoInfo(filename, userId, repo, token);
  try {
    const content = await readMarkdownFile(filename, { repo: effectiveRepo, token: effectiveToken });
    res.json({ status: 'success', content });
  } catch (e) {
    const code = e.status || (/not found/i.test(e.message) ? 404 : 500);
    res.status(code).json({ status: code, message: e.message, detail: e.githubMessage });
  }
}

function readMemoryGET(req, res) {
  req.body = {
    repo: req.query.repo,
    filename: req.query.filename,
    userId: req.query.userId,
    token: req.query.token,
    limit: req.query.limit,
    range: req.query.range,
  };
  return readMemory(req, res);
}

function listMemoryEntries(req, res) {
  logRequest(req);
  const respond = createResponder(req, res);
  try {
    const entries = index_tree.listAllEntries
      ? index_tree.listAllEntries()
      : [];
    return respond(true, { entries });
  } catch (e) {
    logger.error('[listMemoryEntries]', e.stack || e.message);
    return respond(false, e.message || 'Failed to list entries', 500);
  }
}

async function readMemoryPreview(req, res) {
  logRequest(req);
  const respond = createResponder(req, res);

  const { repo, filename, userId, limit } = normalizeMemoryBody(req.body);
  const token = await extractToken(req);
  const { repo: effectiveRepo, token: effectiveToken } = await getRepoInfo(filename, userId, repo, token);
  const normalizedFilename = normalize_memory_path(filename);
  const previewLimit = Math.max(1, parseInt(limit, 10) || 1000);

  const isJson = normalizedFilename.endsWith('.json');
  let content = '';

  try {
    if (effectiveRepo) {
      if (!effectiveToken) {
        return respond(false, 'Missing GitHub token', 401);
      }
      content = await github.readFile(effectiveToken, effectiveRepo, normalizedFilename);
    } else {
      const filePath = path.join(__dirname, '..', normalizedFilename);
      if (!fs.existsSync(filePath)) {
        return respond(false, 'File not found', 404);
      }
      content = fs.readFileSync(filePath, 'utf-8');
    }
  } catch (e) {
    logger.error('[readMemoryPreview]', e.stack || e.message);
    const code = e.status === 404 ? 404 : e.status || 500;
    return respond(false, { error: e.message, details: e.githubMessage }, code);
  }

  const totalLength = content.length;
  const preview = content.slice(0, previewLimit);
  let json = null;
  if (isJson) {
    try {
      json = JSON.parse(preview);
    } catch {
      json = null;
    }
  }

  return respond(true, {
    preview,
    totalLength,
    truncated: totalLength > previewLimit,
    jsonPreview: json,
  });
}

async function saveLessonPlan(req, res) {
  const { title, plannedLessons, repo, userId } = req.body;
  const token = await extractToken(req);
  const { repo: effectiveRepo, token: effectiveToken } = await getRepoInfo('memory/plan.md', userId, repo, token);
  const done = title ? [title] : [];
  const upcoming = Array.isArray(plannedLessons) ? plannedLessons : [];

  try {
    const plan = await updatePlan({
      token: effectiveToken,
      repo: effectiveRepo,
      userId,
      updateFn: p => {
        p.done = [...new Set([...p.done, ...done])];
        p.upcoming = p.upcoming.filter(l => !done.includes(l));
        p.upcoming = [...new Set([...p.upcoming, ...upcoming])];
        return p;
      },
    });
    res.json({ status: 'success', action: 'saveLessonPlan', plan });
  } catch (e) {
    const code = e.status || 500;
    res.status(code).json({ status: code, message: e.message, detail: e.githubMessage });
  }
}

async function saveContext(req, res) {
  const { repo, content, userId } = req.body;
  const token = await extractToken(req);
  const { repo: effectiveRepo, token: effectiveToken } = await getRepoInfo('memory/context.md', userId, repo, token);

  ensure_dir(contextFilename());
  try {
    await writeFileSafe(contextFilename(), content || '');
  } catch (e) {
    const code = e.status || 500;
    return res
      .status(code)
      .json({ status: code, message: e.message, detail: e.githubMessage });
  }

  if (effectiveRepo && effectiveToken) {
    const access = checkAccess('memory/context.md', 'write');
    if (!access.allowed) {
      logError('access denied', new Error(access.message));
      return res.status(403).json({ status: 403, message: access.message });
    }
    try {
      await github.writeFileSafe(
        effectiveToken,
        effectiveRepo,
        'memory/context.md',
        content || '',
        'update context'
      );
    } catch (e) {
      logError('GitHub write context', e);
      const code = e.status || 500;
      return res
        .status(code)
        .json({ status: code, message: e.message, detail: e.githubMessage });
    }
  }

  try {
    await rebuildIndex(effectiveRepo, effectiveToken, userId);
  } catch (e) {
    logError('saveContext rebuild', e);
    const code = e.status || 500;
    return res
      .status(code)
      .json({ status: code, message: e.message, detail: e.githubMessage });
  }

  res.json({ status: 'success', action: 'saveContext' });
}

async function readContext(req, res) {
  const { repo, userId } = req.body;
  const token = await extractToken(req);
  const { repo: effectiveRepo, token: effectiveToken } = await getRepoInfo('memory/context.md', userId, repo, token);

  ensure_dir(contextFilename());

  if (effectiveRepo && effectiveToken) {
    try {
      const content = await github.readFile(effectiveToken, effectiveRepo, 'memory/context.md');
      return res.json({ status: 'success', content });
    } catch (e) {
      logError('GitHub read context', e);
    }
  }

  const content = fs.existsSync(contextFilename()) ? fs.readFileSync(contextFilename(), 'utf-8') : '';
  res.json({ status: 'success', content });
}

async function updateIndexManual(req, res) {
  const { entries, repo, userId } = req.body;
  const token = await extractToken(req);
  const { repo: effectiveRepo, token: effectiveToken } = await getRepoInfo('memory/index.json', userId, repo, token);
  try {
    const result = await updateIndexFileManually(entries, effectiveRepo, effectiveToken, userId);
    res.json({ status: 'success', entries: result });
  } catch (e) {
    const code = e.status || 500;
    res.status(code).json({ status: code, message: e.message, detail: e.githubMessage });
  }
}

async function getToken(req, res) {
  const userId = req.body && req.body.userId;
  const token = await token_store.getToken(userId);
  res.json({ token: token || null });
}

async function setToken(req, res) {
  const token = req.body && req.body.token ? req.body.token : '';
  const userId = req.body && req.body.userId;
  if (userId) await token_store.setToken(userId, token);
  res.json({ status: 'success', action: 'setToken', connected: !!token });
}

async function tokenStatus(req, res) {
  const userId = req.query.userId || (req.body && req.body.userId);
  const token = userId ? await token_store.getToken(userId) : null;
  res.json({ connected: !!token });
}

function readPlan(req, res) {
  try {
    ensure_dir(planFilename());
    const content = fs.existsSync(planFilename()) ? fs.readFileSync(planFilename(), 'utf-8') : '{}';
    const plan = JSON.parse(content || '{}');
    res.json({ status: 'success', plan });
  } catch (e) {
    const code = e.status || 500;
    res.status(code).json({ status: code, message: e.message, detail: e.githubMessage });
  }
}

function readProfile(req, res) {
  const filePath = path.join(__dirname, '..', 'memory', 'profile.json');
  if (fs.existsSync(filePath)) {
    const data = fs.readFileSync(filePath, 'utf-8');
    res.type('application/json').send(data);
  } else {
    res.status(404).json({ status: 'error', message: 'Profile not found' });
  }
}

async function save(req, res) {
  const type = req.body && req.body.type;
  if (type === 'context') {
    return saveContext(req, res);
  }

  const { repo, token, filename, content } = req.body || {};
  if (!repo || !token || !filename || content === undefined) {
    return res
      .status(400)
      .json({ status: 'error', message: 'Missing repo, token, filename or content' });
  }

  try {
    const check = await github.validateToken(token);
    if (!check.valid) {
      return res.status(401).json({ status: 'error', message: 'Invalid GitHub token' });
    }

    const normalized = normalize_memory_path(filename);
    const access = checkAccess(normalized, 'write');
    if (!access.allowed) {
      logError('access denied', new Error(access.message));
      return res.status(403).json({ status: 403, message: access.message });
    }
    await github.writeFileSafe(token, repo, normalized, content, `Update ${normalized}`);
    res.json({ status: 'ok' });
  } catch (e) {
    logError('save endpoint', e);
    const code = e.status || 500;
    res.status(code).json({ status: code, message: e.message, detail: e.githubMessage });
  }
}

async function read(req, res) {
  const type = req.body && req.body.type;
  if (type === 'context') {
    return readContext(req, res);
  }
  return readMemory(req, res);
}

router.post('/save', save);
router.post('/saveMemory', saveMemory);
router.post('/readMemory', readMemory);
router.get('/api/saveMemory', (req, res) => methodNotAllowed(res, ['POST']));
router.post('/api/saveMemory', saveMemory);
router.get('/api/readMemory', readMemoryGET);
router.post('/api/readMemory', readMemory);
router.get('/api/memory/read', readMemoryGET);
router.get('/api/memory/list', listMemoryEntries);
router.post('/api/memory/preview', readMemoryPreview);
router.post('/read', read);
router.post('/readFile', readFileRoute);
router.get('/memory', readMemoryGET);
router.post('/setMemoryRepo', setMemoryRepo);
router.post('/memory/set-mode', setMemoryModeRoute);
router.get('/status', systemStatus);
router.post('/status', systemStatus);
router.post('/saveMemoryWithIndex', saveMemoryWithIndexRoute);
router.post('/loadMemoryToContext', loadMemoryToContextRoute);
router.post('/loadContextFromIndex', loadContextFromIndexRoute);
// Новые неймспейсы /api/* с сохранением обратной совместимости
router.post('/api/files/save', save);
router.post('/api/files/read', read);
router.post('/api/memory/save', saveMemory);
router.post('/api/memory/read', readMemory);
router.post('/api/memory/save-with-index', saveMemoryWithIndexRoute);
router.post('/api/memory/context', loadMemoryToContextRoute);
router.post('/api/memory/load-to-context', loadMemoryToContextRoute);
router.post('/api/memory/load-from-index', loadContextFromIndexRoute);
router.post('/api/lessons/save-plan', saveLessonPlan);
router.post('/api/lessons/save-answer', saveAnswer);
router.post('/api/system/switch_repo', setMemoryRepo);
router.get('/api/system/status', systemStatus);
router.post('/api/system/status', systemStatus);
router.post('/saveLessonPlan', saveLessonPlan);
async function saveMemoryWithIndexRoute(req, res) {
  const { userId, repo, token, filename, content } = req.body;
  const { repo: effectiveRepo, token: effectiveToken } = await getRepoInfo(filename, userId, repo, token || await extractToken(req));
  if (!effectiveRepo) {
    const verdict = validateLocalAuth(req);
    if (!verdict.ok) {
      const status = verdict.status || 401;
      return res.status(status).json({ status: 'error', message: verdict.message });
    }
  }
  if (effectiveRepo) {
    if (!effectiveToken) {
      return res.status(401).json({ status: 'error', message: 'Missing GitHub token' });
    }
    try {
      const check = await github.validateToken(effectiveToken);
      if (!check.valid) {
        return res.status(401).json({ status: 'error', message: 'Invalid GitHub token' });
      }
    } catch (e) {
      logError('validateToken', e);
      return res.status(401).json({ status: 'error', message: 'Invalid GitHub token' });
    }
    try {
      const { exists, status } = await github.repoExistsSafe(
        effectiveToken,
        effectiveRepo
      );
      if (!exists) {
        if (status === 401) {
          return res.status(401).json({ status: 'error', message: 'Invalid GitHub token.' });
        }
        if (status === 403) {
          return res.status(403).json({ status: 'error', message: 'Access denied to repository.' });
        }
        return res.status(404).json({ status: 'error', message: 'Repository not found.' });
      }
    } catch (e) {
      logError('repoExists', e);
      return res.status(404).json({ status: 'error', message: 'Repository not found.' });
    }
  }
  try {
    const pathSaved = await index_manager.saveMemoryWithIndex(
      userId,
      effectiveRepo,
      effectiveToken,
      filename,
      content
    );
    res.json({ status: 'success', path: pathSaved });
  } catch (e) {
    const code = e.status || 500;
    res.status(code).json({ status: code, message: e.message, detail: e.githubMessage });
  }
}
router.post('/saveAnswer', saveAnswer);
router.post('/getToken', getToken);
router.post('/saveNote', (req, res) => res.json({ status: 'success', action: 'saveNote' }));
router.post('/getContextSnapshot', (req, res) => res.json({ status: 'success', context: {} }));
router.post('/createUserProfile', (req, res) => res.json({ status: 'success', action: 'createUserProfile' }));
router.post('/setToken', setToken);
router.get('/token/status', tokenStatus);
router.get('/tokenStatus', tokenStatus);
router.get('/readContext', readContext);
router.post('/saveContext', saveContext);
async function loadMemoryToContextRoute(req, res) {
  const { filename, repo, userId } = req.body || {};
  const token = await extractToken(req);
  if (!filename) {
    return res.status(400).json({ status: 'error', message: 'Missing filename' });
  }
  const { repo: effectiveRepo, token: effectiveToken } = await getRepoInfo(
    filename,
    userId,
    repo,
    token
  );
  try {
    const result = await load_memory_to_context(
      filename,
      effectiveRepo,
      effectiveToken
    );
    res.json({ status: 'success', loaded: result.file });
  } catch (e) {
    const code = e.status || 500;
    res.status(code).json({ status: code, message: e.message, detail: e.githubMessage });
  }
}

async function loadContextFromIndexRoute(req, res) {
  const { index, repo, userId } = req.body || {};
  const token = await extractToken(req);
  if (!index) {
    return res.status(400).json({ status: 'error', message: 'Missing index' });
  }
  const { repo: effectiveRepo, token: effectiveToken } = await getRepoInfo(
    index,
    userId,
    repo,
    token
  );
  try {
    const result = await load_context_from_index(
      index,
      effectiveRepo,
      effectiveToken
    );
    res.json({ status: 'success', loaded: result ? result.files : [] });
  } catch (e) {
    const code = e.status || 500;
    res.status(code).json({ status: code, message: e.message, detail: e.githubMessage });
  }
}
router.post('/chat/setup', async (req, res) => {
  const text = req.body && req.body.text ? req.body.text : '';
  // Используем функцию разбора команды из утилит
  const { parse_user_memory_setup } = require('../utils/helpers');
  const parsed = await parse_user_memory_setup(text);
  if (!parsed) return res.status(400).json({ status: 'error', message: 'Invalid command' });
  const { userId, repo } = parsed;
  res.json({ status: 'success', message: `Memory configured for user: ${userId}`, repo });
});

router.post('/chat/create_memory_folder', async (req, res) => {
  const text = req.body && req.body.text ? req.body.text : '';
  const { parse_create_memory_folder } = require('../utils/helpers');
  const { createMemoryFolder } = require('../src/memory');
  const parsed = parse_create_memory_folder(text);
  if (!parsed)
    return res.status(400).json({ status: 'error', message: 'Invalid command' });
  const { name, init_index } = parsed;
  try {
    await createMemoryFolder(name, init_index);
    res.json({ status: 'success', folder: name });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

router.post('/chat/load_memory', async (req, res) => {
  const text = req.body && req.body.text ? req.body.text : '';
  const { parse_load_memory } = require('../utils/helpers');
  const { switchMemoryFolder } = require('../utils/memory_mode');
  const parsed = parse_load_memory(text);
  if (!parsed)
    return res.status(400).json({ status: 'error', message: 'Invalid command' });
  const { name } = parsed;
  try {
    const { index, plan } = await switchMemoryFolder(getDefaultUserId(), name);
    res.json({ status: 'success', folder: name, index, plan });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});
router.post('/mark_important', async (req, res) => {
  const { file, userId } = req.body || {};
  if (!file) {
    return res.status(400).json({ status: 'error', message: 'Missing file' });
  }
  try {
    const normalized = normalize_memory_path(file);
    const existing = index_manager.getByPath(normalized);
    const current = existing ? existing.importance_score || 0 : 0;
    const updated = await index_manager.updateMetadata(
      normalized,
      'importance_score',
      Math.min(current + 0.2, 1)
    );
    res.json({ status: 'success', importance_score: updated.importance_score });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});
router.post('/updateIndex', updateIndexManual);
router.get('/plan', readPlan);
router.get('/profile', readProfile);

router._check_context_for_user = check_context_for_user;
router._process_users_in_batches = process_users_in_batches;
module.exports = router;
