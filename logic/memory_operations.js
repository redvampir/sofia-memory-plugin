const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const github = require('../tools/github_client');
const token_store = require('../tools/token_store');
const memory_config = require('../tools/memory_config');
const mdEditor = require('./markdown_editor');
const fileEditor = require('./markdown_file_editor');
const validator = require('./markdown_validator');
const {
  ensure_dir,
  deepMerge,
  normalize_memory_path,
} = require('../tools/file_utils');
const { checkAccess } = require('../utils/access_control');
const {
  getRepoInfo,
  categorizeMemoryFile,
  logDebug,
} = require('../tools/memory_helpers');
const memory_settings = require('../tools/memory_settings');
const { parseFrontMatter } = require('../utils/markdown_utils');
const { appendSummaryLog } = require('../versioning');
const { isLocalMode, resolvePath, baseDir } = require('../utils/memory_mode');
const { requestToAgent } = require('../src/memory_plugin');
const logger = require('../utils/logger');

const ENV_MAX_READ = Number.parseInt(process.env.MAX_READ_CHUNK || '', 10);
const DEFAULT_MAX_READ_CHUNK = Number.isFinite(ENV_MAX_READ) && ENV_MAX_READ > 0 ? ENV_MAX_READ : 64 * 1024;

function clampReadLimit(limit, maxLimit = DEFAULT_MAX_READ_CHUNK) {
  const safeMax = Number.isFinite(maxLimit) && maxLimit > 0 ? maxLimit : DEFAULT_MAX_READ_CHUNK;
  const normalized = Number.isFinite(limit) && limit > 0 ? limit : safeMax;
  return Math.min(normalized, safeMax);
}

class StorageLimitError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'StorageLimitError';
    this.code = code;
    this.details = details;
  }
}

function contextFilename(userId = 'default') {
  return isLocalMode(userId)
    ? path.join(baseDir(userId), 'memory', 'context.md')
    : path.join(__dirname, '..', 'memory', 'context.md');
}

function planFilename(userId = 'default') {
  return isLocalMode(userId)
    ? path.join(baseDir(userId), 'memory', 'plan.md')
    : path.join(__dirname, '..', 'memory', 'plan.md');
}

function indexFilename(userId = 'default') {
  return isLocalMode(userId)
    ? path.join(baseDir(userId), 'memory', 'index.json')
    : path.join(__dirname, '..', 'memory', 'index.json');
}

const opCounts = { added: 0, updated: 0, skipped: 0, preserved: 0 };

let planCache = null;

async function safeUpdateIndexEntry(newEntry) {
  let index = [];
  try {
    const raw = fs.readFileSync(indexFilename(), 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) index = parsed;
    else return; // unsupported format
  } catch (e) {
    console.warn('[INDEX] index.json not found or corrupted, creating new');
  }

  const existingIndex = index.findIndex(entry => entry.path === newEntry.path);
  if (existingIndex !== -1) {
    index[existingIndex] = { ...index[existingIndex], ...newEntry };
    console.log(`[INDEX] Updated entry: ${newEntry.path}`);
  } else {
    index.push(newEntry);
    console.log(`[INDEX] Added new entry: ${newEntry.path}`);
  }

  fs.writeFileSync(indexFilename(), JSON.stringify(index, null, 2), 'utf-8');
}

function parsePlanMarkdown(md) {
  const plan = { completedLessons: [], requestedClarifications: [], nextLesson: '' };
  const lines = md.split(/\r?\n/);
  let section = '';
  for (const line of lines) {
    if (/^##\s+Completed Lessons/i.test(line)) { section = 'completed'; continue; }
    if (/^##\s+Requested Clarifications/i.test(line)) { section = 'clar'; continue; }
    if (/^##\s+Progress/i.test(line)) { section = 'progress'; continue; }
    if (/^-\s+/.test(line) && section === 'completed') {
      plan.completedLessons.push(line.replace(/^-\s+/, '').trim());
    } else if (/^-\s+/.test(line) && section === 'clar') {
      plan.requestedClarifications.push(line.replace(/^-\s+/, '').trim());
    } else if (section === 'progress') {
      const m = line.match(/Next lesson:\s*(.*)/i);
      if (m) plan.nextLesson = m[1].trim();
    }
  }
  return plan;
}

function planToMarkdown(plan) {
  const completed = (plan.completedLessons || []).map(t => `- ${t}`).join('\n');
  const clar = (plan.requestedClarifications || []).map(t => `- ${t}`).join('\n');
  const total = plan.totalLessons || (plan.completedLessons || []).length;
  return (
    `# Learning Plan\n\n` +
    `## Completed Topics\n${completed}\n\n` +
    `## Clarified or Expanded Topics\n${clar}\n\n` +
    `## Progress: ${plan.completedLessons.length} / ${total} lessons complete` +
    (plan.nextLesson ? `\nNext lesson: ${plan.nextLesson}` : '') +
    `\n`
  );
}

async function getLessonEntries() {
  const raw = await sanitizeIndex(readIndexSafe());
  return raw.filter(e => e.type === 'lesson');
}

async function updatePlanFromIndex(plan) {
  const lessons = await getLessonEntries();
  const titles = new Set();
  plan.completedLessons = [];
  lessons
    .sort((a, b) => {
      if (a.lastModified && b.lastModified) {
        return new Date(a.lastModified) - new Date(b.lastModified);
      }
      return (a.path || '').localeCompare(b.path || '');
    })
    .forEach(l => {
      const title = l.title || path.basename(l.path || '');
      if (!titles.has(title)) {
        titles.add(title);
        plan.completedLessons.push(title);
      }
    });
  plan.totalLessons = lessons.length;
  return plan;
}

async function ensureContext() {
  try {
    await fsp.access(contextFilename());
  } catch {
    ensure_dir(contextFilename());
    await writeFileSafe(contextFilename(), '# Context\n');
    rebuildIndex().catch(e =>
      console.error('[ensureContext] rebuild error', e.message)
    );
  }
}

function parsePlanFile(md) {
  const lines = md.split(/\r?\n/);
  let section = null;
  const result = {
    lines,
    done: [],
    upcoming: [],
    doneStart: -1,
    doneEnd: -1,
    upcomingStart: -1,
    upcomingEnd: -1
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const header = line.match(/^##\s*(.+)/);
    if (header) {
      const name = header[1].toLowerCase();
      if (section === 'done') result.doneEnd = i;
      if (section === 'upcoming') result.upcomingEnd = i;
      if (name.startsWith('completed')) {
        section = 'done';
        result.doneStart = i + 1;
      } else if (name.startsWith('upcoming')) {
        section = 'upcoming';
        result.upcomingStart = i + 1;
      } else {
        section = null;
      }
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const item = line.replace(/^[-*]\s+/, '').replace(/^✅\s*/, '').trim();
      if (section === 'done') result.done.push(item);
      if (section === 'upcoming') result.upcoming.push(item);
    }
  }

  if (section === 'done') result.doneEnd = lines.length;
  if (section === 'upcoming') result.upcomingEnd = lines.length;
  return result;
}

function buildPlanFile(parsed, done, upcoming) {
  const lines = parsed.lines.slice();

  const doneLines = done.map(t => `- ✅ ${t}`);
  if (parsed.doneStart >= 0) {
    lines.splice(parsed.doneStart, parsed.doneEnd - parsed.doneStart, ...doneLines);
  } else {
    lines.push('## Completed Lessons', ...doneLines, '');
  }

  const upcomingLines = upcoming.map(t => `- ${t}`);
  if (parsed.upcomingStart >= 0) {
    lines.splice(parsed.upcomingStart, parsed.upcomingEnd - parsed.upcomingStart, ...upcomingLines);
  } else {
    lines.push('## Upcoming Lessons', ...upcomingLines, '');
  }

  return lines.join('\n');
}

async function updatePlan({ token, repo, updateFn, userId } = {}) {
  const relPath = 'memory/plan.md';
  const absPath = resolvePath(relPath, 'default');

  const { repo: finalRepo, token: finalToken } = await getRepoInfo(relPath, userId, repo, token);

  let md = '';
  if (finalRepo && finalToken) {
    try {
      md = await github.readFile(finalToken, finalRepo, relPath);
    } catch (e) {
      logDebug('[updatePlan] no remote plan', e.message);
    }
  }
  if (!md) {
    try {
      await fsp.access(absPath);
      md = await fsp.readFile(absPath, 'utf-8');
    } catch {
      // ignore missing file
    }
  }
  if (!md) {
    md = '# Learning Plan\n\n## Completed Lessons\n\n## Upcoming Lessons\n';
  }

  const parsed = parsePlanFile(md);
  const current = { done: parsed.done.slice(), upcoming: parsed.upcoming.slice() };
  const updated = updateFn ? updateFn(current) : current;

  const newMd = buildPlanFile(parsed, updated.done || [], updated.upcoming || []);

  await writeFileSafe(absPath, newMd);
  if (finalRepo && finalToken) {
    await github.writeFileSafe(finalToken, finalRepo, relPath, newMd, 'update plan.md');
  }

  console.log('[updatePlan] ✅ plan.md updated');
  return updated;
}

async function loadPlan() {
  ensure_dir(planFilename());
  let existed = true;
  try {
    await fsp.access(planFilename());
  } catch {
    existed = false;
  }
  let plan;
  if (existed) {
    try {
      const content = await fsp.readFile(planFilename(), 'utf-8');
      plan = parsePlanMarkdown(content);
    } catch {
      plan = { completedLessons: [], requestedClarifications: [], nextLesson: '' };
    }
  } else {
    plan = { completedLessons: [], requestedClarifications: [], nextLesson: '' };
  }

  plan = await updatePlanFromIndex(plan);
  await writeFileSafe(planFilename(), planToMarkdown(plan));
  planCache = plan;
  if (!existed) {
    rebuildIndex().catch(e =>
      console.error('[loadPlan] rebuild error', e.message)
    );
  }
}

async function savePlan(repo, token) {
  if (!planCache) await loadPlan();
  const md = planToMarkdown(planCache);
  await writeFileSafe(planFilename(), md);
  if (repo && token) {
    try {
      await github.writeFileSafe(
        token,
        repo,
        path.relative(path.join(__dirname, '..'), planFilename()),
        md,
        'update plan'
      );
    } catch (e) {
      console.error('GitHub write plan error', e.message);
      throw e;
    }
  }
  await rebuildIndex(repo, token);
}

async function writeFileSafe(filePath, data, force = false) {
  try {
    const relPath = path
      .relative(path.join(__dirname, '..'), filePath)
      .replace(/\\/g, '/');
    const accessCheck = checkAccess(relPath, 'write');
    if (!accessCheck.allowed) {
      console.error(`[writeFileSafe] ${accessCheck.message}`);
      throw new Error(accessCheck.message);
    }
    ensure_dir(filePath);
    if (filePath.toLowerCase().endsWith('.md')) {
      const check = validator.validateMarkdownSyntax(data, filePath);
      if (!check.valid) {
        const backup = mdEditor.createBackup(filePath);
        console.error(
          `[writeFileSafe] ${check.message} at line ${check.line} in '${path.basename(filePath)}'`
        );
        if (backup) {
          console.error(`[writeFileSafe] You can restore from: ${backup}`);
        }
        if (!force) return;
      }
      mdEditor.createBackup(filePath);
    }
    const tokens = String(data).split(/\s+/).filter(Boolean).length;
    if (tokens > memory_settings.token_soft_limit) {
      if (memory_settings.enforce_soft_limit && !force) {
        console.warn('[writeFileSafe] token limit reached', tokens);
        return;
      }
      console.log('[Preserve] Saved despite context limit:', filePath);
      opCounts.preserved++;
      appendSummaryLog(`[Preserve] Saved despite context limit: ${filePath}`);
    }
    await fsp.writeFile(filePath, data, 'utf-8');
    logDebug('[writeFileSafe] wrote', filePath);
  } catch (e) {
    console.error(`[writeFileSafe] Error writing ${filePath}`, e.message);
    throw e;
  }
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function calculateDirectorySize(dir) {
  let total = 0;
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await calculateDirectorySize(fullPath);
    } else if (entry.isFile()) {
      const stat = await fsp.stat(fullPath);
      total += stat.size;
    }
  }
  return total;
}

async function removeLocalFiles(paths) {
  for (const p of paths) {
    try {
      await fsp.unlink(p);
    } catch (e) {
      if (e.code !== 'ENOENT') {
        throw e;
      }
    }
  }
}

async function collectExistingTargets(dir, baseName) {
  const parsed = path.parse(baseName);
  const partPattern = new RegExp(`^${escapeRegExp(parsed.name)}_part\\d+${escapeRegExp(parsed.ext)}$`, 'i');
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  const targets = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (entry.name === baseName || partPattern.test(entry.name)) {
      targets.push(path.join(dir, entry.name));
    }
  }

  return targets;
}

async function measurePathsSize(paths) {
  let total = 0;
  for (const p of paths) {
    try {
      const stat = await fsp.stat(p);
      total += stat.size;
    } catch {
      // ignore missing files
    }
  }
  return total;
}

function buildPartFilename(filePath, index) {
  const { dir, name, ext } = path.parse(filePath);
  return path.join(dir, `${name}_part${index}${ext}`);
}

function normalizePosix(value) {
  return value.replace(/\\/g, '/');
}

function splitBufferToParts(buffer, partSize) {
  const parts = [];
  let offset = 0;
  let index = 1;
  while (offset < buffer.length) {
    const chunk = buffer.slice(offset, offset + partSize);
    parts.push({ index, size: chunk.length, buffer: chunk });
    offset += partSize;
    index += 1;
  }
  return parts;
}

async function loadMemorySplitIndex(normalizedFilename, { repo, token } = {}) {
  const dir = path.posix.dirname(normalizedFilename);
  const indexRel = path.posix.join(dir, 'memory_index.json');
  const original = normalizePosix(normalizedFilename);
  try {
    const raw = repo && token
      ? await github.readFile(token, repo, indexRel)
      : await fsp.readFile(path.join(__dirname, '..', indexRel), 'utf-8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return null;
    return data.find(entry => normalizePosix(entry.originalFile || '') === original) || null;
  } catch (e) {
    logger.debug('[loadMemorySplitIndex] метаданные недоступны', e.message);
    return null;
  }
}

function calculatePartWindow(meta, offset, limit) {
  const totalSize = Number.isFinite(meta?.size) ? meta.size : null;
  if (!Array.isArray(meta?.parts) || !meta.parts.length) {
    return {
      target: meta?.originalFile,
      part: 1,
      parts: 1,
      range: { start: offset, end: offset + limit - 1 },
      totalSize,
      originalStart: offset,
    };
  }

  const partSize = Number.isFinite(meta.partSize) && meta.partSize > 0 ? meta.partSize : null;
  if (totalSize !== null && offset >= totalSize) {
    const err = new Error('Диапазон выходит за пределы файла');
    err.status = 416;
    throw err;
  }

  const parts = meta.parts.map(p => normalizePosix(p));
  const idx = Math.min(
    partSize ? Math.floor(offset / partSize) : Math.floor((offset / Math.max(totalSize || offset + 1, 1)) * parts.length),
    parts.length - 1
  );
  const partStart = partSize ? idx * partSize : Math.floor((totalSize || 0) / parts.length) * idx;
  const partEnd = totalSize !== null ? Math.min(totalSize - 1, partStart + (partSize || limit) - 1) : partStart + limit - 1;
  const innerOffset = offset - partStart;
  const bytes = Math.max(1, Math.min(limit, partEnd - offset + 1));

  return {
    target: parts[idx],
    part: idx + 1,
    parts: parts.length,
    range: { start: innerOffset, end: innerOffset + bytes - 1 },
    totalSize,
    originalStart: offset,
    originalEnd: offset + bytes - 1,
  };
}

async function resolveMemoryReadTarget({
  normalizedFilename,
  offset = 0,
  limit,
  repo,
  token,
  maxLimit = DEFAULT_MAX_READ_CHUNK,
}) {
  if (!Number.isFinite(offset) || offset < 0) {
    const err = new Error('offset должен быть неотрицательным числом');
    err.status = 400;
    throw err;
  }
  if (!Number.isFinite(limit) || limit <= 0) {
    const err = new Error('limit должен быть положительным числом');
    err.status = 400;
    throw err;
  }

  const boundedLimit = clampReadLimit(limit, maxLimit);

  const meta = await loadMemorySplitIndex(normalizedFilename, { repo, token });
  const selected = calculatePartWindow(meta || { originalFile: normalizedFilename }, offset, boundedLimit);

  if (!repo) {
    const absTarget = path.join(__dirname, '..', selected.target);
    const exists = await fsp
      .access(absTarget)
      .then(() => true)
      .catch(() => false);
    if (!exists) {
      const err = new Error('Часть файла не найдена');
      err.status = 404;
      throw err;
    }
    const stats = await fsp.stat(absTarget).catch(() => null);
    const totalSize = Number.isFinite(selected.totalSize) ? selected.totalSize : stats?.size ?? null;
    if (totalSize !== null && offset >= totalSize) {
      const err = new Error('Диапазон выходит за пределы файла');
      err.status = 416;
      throw err;
    }
    return { ...selected, totalSize };
  }

  return selected;
}

async function removeFromMemoryIndex(indexPath, originalFile, repo, token) {
  ensure_dir(indexPath);
  const relIndex = path.relative(path.join(__dirname, '..'), indexPath).replace(/\\/g, '/');

  let indexData = [];
  try {
    const raw = await fsp.readFile(indexPath, 'utf-8');
    indexData = JSON.parse(raw);
    if (!Array.isArray(indexData)) {
      indexData = [];
    }
  } catch {
    // ignore missing or invalid file
  }

  const updated = indexData.filter(entry => entry && entry.originalFile !== originalFile);
  if (updated.length === indexData.length) return;

  const serialized = JSON.stringify(updated, null, 2);
  await writeFileSafe(indexPath, serialized, true);

  if (repo && token) {
    await github.writeFileSafe(token, repo, relIndex, serialized, 'update memory_index.json');
  }
}

async function updateMemoryIndex({
  indexPath,
  originalFile,
  parts,
  size,
  partSize,
  created,
  repo,
  token,
}) {
  ensure_dir(indexPath);
  const relIndex = path.relative(path.join(__dirname, '..'), indexPath).replace(/\\/g, '/');

  let indexData = [];
  try {
    const raw = await fsp.readFile(indexPath, 'utf-8');
    indexData = JSON.parse(raw);
    if (!Array.isArray(indexData)) {
      indexData = [];
    }
  } catch {
    // ignore missing or invalid file
  }

  const existingIdx = indexData.findIndex(entry => entry && entry.originalFile === originalFile);
  const payload = { originalFile, parts, size, partSize, created };
  if (existingIdx >= 0) {
    indexData[existingIdx] = { ...indexData[existingIdx], ...payload };
  } else {
    indexData.push(payload);
  }

  const serialized = JSON.stringify(indexData, null, 2);
  await writeFileSafe(indexPath, serialized, true);

  if (repo && token) {
    await github.writeFileSafe(token, repo, relIndex, serialized, 'update memory_index.json');
  }
}

async function saveContentWithSplitting({
  filePath,
  content,
  maxFileSize,
  autoSplit,
  repo,
  token,
  maxTotalFile,
  maxParts,
}) {
  const buffer = Buffer.from(String(content));
  const size = buffer.byteLength;
  const limit = Number.isFinite(maxFileSize) && maxFileSize > 0 ? maxFileSize : null;
  const partsLimit = Number.isFinite(maxParts) && maxParts > 0 ? maxParts : null;
  const totalLimit = Number.isFinite(maxTotalFile) && maxTotalFile > 0 ? maxTotalFile : null;

  ensure_dir(filePath);
  const dir = path.dirname(filePath);
  const baseName = path.basename(filePath);
  const relFile = path.relative(path.join(__dirname, '..'), filePath).replace(/\\/g, '/');
  const indexPath = path.join(dir, 'memory_index.json');

  const existingTargets = await collectExistingTargets(dir, baseName);
  const existingSize = await measurePathsSize(existingTargets);
  const dirSize = await calculateDirectorySize(dir).catch(() => 0);

  const projectedSize = dirSize - existingSize + size;
  if (totalLimit && projectedSize > totalLimit) {
    throw new StorageLimitError('TotalLimitExceeded', 'Превышен общий лимит хранилища', {
      maxTotalFile: totalLimit,
      projectedSize,
    });
  }

  if (!limit || size <= limit) {
    await writeFileSafe(filePath, content);
    if (repo && token) {
      await github.writeFileSafe(token, repo, relFile, content, `update ${baseName}`);
    }
    const staleTargets = existingTargets.filter(p => path.resolve(p) !== path.resolve(filePath));
    await removeLocalFiles(staleTargets);
    await removeFromMemoryIndex(indexPath, relFile, repo, token);
    return { savedPath: relFile, size, parts: [] };
  }

  if (!autoSplit) {
    throw new StorageLimitError('FileTooLargeError', 'Размер файла превышает допустимый лимит', {
      size,
      maxFileSize: limit,
    });
  }

  const partSize = limit;
  const parts = splitBufferToParts(buffer, partSize);
  if (partsLimit && parts.length > partsLimit) {
    throw new StorageLimitError('PartsLimitExceeded', 'Превышено количество создаваемых частей', {
      maxParts: partsLimit,
      parts: parts.length,
    });
  }

  const partsTotal = parts.reduce((acc, part) => acc + part.size, 0);
  const projectedWithParts = dirSize - existingSize + partsTotal;
  if (totalLimit && projectedWithParts > totalLimit) {
    throw new StorageLimitError('TotalLimitExceeded', 'Превышен общий лимит хранилища', {
      maxTotalFile: totalLimit,
      projectedSize: projectedWithParts,
    });
  }

  const partPaths = [];
  const absPartPaths = [];
  for (const part of parts) {
    const partPath = buildPartFilename(filePath, part.index);
    const relPart = path.relative(path.join(__dirname, '..'), partPath).replace(/\\/g, '/');
    await writeFileSafe(partPath, part.buffer.toString('utf-8'));
    if (repo && token) {
      await github.writeFileSafe(
        token,
        repo,
        relPart,
        part.buffer.toString('utf-8'),
        `update ${path.basename(partPath)}`
      );
    }
    partPaths.push(relPart);
    absPartPaths.push(path.resolve(partPath));
  }

  const staleTargets = existingTargets.filter(p => !absPartPaths.includes(path.resolve(p)));
  await removeLocalFiles(staleTargets);

  await updateMemoryIndex({
    indexPath,
    originalFile: relFile,
    parts: partPaths,
    size,
    partSize,
    created: new Date().toISOString(),
    repo,
    token,
  });

  return { savedPath: relFile, size, parts: partPaths, partSize };
}


async function updateOrInsertJsonEntry(filePath, newData, matchKey, repo, token) {
  ensure_dir(filePath);
  const relPath = path.relative(baseDir('default'), filePath);
  let existing = Array.isArray(newData) ? [] : {};

  if (repo && token) {
    try {
      const remote = await github.readFile(token, repo, relPath);
      existing = JSON.parse(remote);
    } catch {
      // ignore missing remote file
    }
  }

  try {
    await fsp.access(filePath);
    const local = await fsp.readFile(filePath, 'utf-8');
    existing = deepMerge(existing, JSON.parse(local), matchKey);
  } catch {
    // ignore missing or parse errors
  }

  const updated = deepMerge(existing, newData, matchKey);
  await writeFileSafe(filePath, JSON.stringify(updated, null, 2));

  if (repo && token) {
    try {
      await github.writeFileSafe(
        token,
        repo,
        relPath,
        JSON.stringify(updated, null, 2),
        `update ${path.basename(filePath)}`
      );
    } catch (e) {
      console.error('GitHub write error', e.message);
      throw e;
    }
  }

  return updated;
}

async function fileExistsInRepo(repo, token, relPath) {
  if (!repo || !token) return true;
  try {
    await github.readFile(token, repo, relPath);
    return true;
  } catch (e) {
    if (e.response?.status === 404) return false;
    console.error('[fileExistsInRepo] GitHub check failed', e.message);
    return true;
  }
}

function deduplicateEntries(entries) {
  const byPath = new Map();

  // First pass: deduplicate by normalized path, keeping the most recent entry
  entries.forEach(e => {
    if (!e || !e.path) return;
    const normalized = normalize_memory_path(e.path);
    const existing = byPath.get(normalized);
    if (!existing || new Date(e.lastModified || 0) > new Date(existing.lastModified || 0)) {
      if (existing) {
        console.warn(`[deduplicateEntries] keeping newer entry for ${normalized}`);
      }
      byPath.set(normalized, { ...existing, ...e, path: normalized });
    } else {
      console.warn(`[deduplicateEntries] duplicate ${e.path} ignored; matches ${existing.path}`);
    }
  });

  // Second pass: deduplicate by title/base name
  const byTitle = new Map();
  const result = [];
  Array.from(byPath.values()).forEach(e => {
    const base = path.basename(e.path).toLowerCase().replace(/\.[^.]+$/, '');
    const key = (e.title || '').toLowerCase() || base.replace(/[-_].*/, '');
    if (byTitle.has(key)) {
      console.warn(`[deduplicateEntries] duplicate ${e.path} ignored; matches ${byTitle.get(key).path}`);
    } else {
      byTitle.set(key, e);
      result.push(e);
    }
  });

  return result;
}

const EXCLUDED = new Set([
  'memory/index.json',
  'memory/plan.md',
  'memory/context.md',
  'memory/test.md',
  'memory/test.txt',
]);

const { array_to_index } = require('../tools/index_utils');
const index_tree = require('../tools/index_tree');

function readIndexSafe() {
  try {
    return index_tree.listAllEntries();
  } catch {
    return [];
  }
}

async function sanitizeIndex(entries) {
  const map = new Map();
  for (const e of entries) {
    if (!e || !e.path) continue;
    const normalized = normalize_memory_path(e.path);
    if (EXCLUDED.has(normalized)) continue;
    const abs = path.join(path.join(__dirname, '..'), normalized);
    try {
      await fsp.access(abs);
    } catch {
      console.warn(`[sanitizeIndex] missing file ${normalized}, keeping entry`);
    }
    const existing = map.get(normalized);
    if (
      !existing ||
      new Date(e.lastModified || 0) > new Date(existing.lastModified || 0)
    ) {
      map.set(normalized, { ...existing, ...e, path: normalized });
    }
  }
  return Array.from(map.values());
}

async function extractMeta(fullPath) {
  const stats = await fsp.stat(fullPath);
  const result = { lastModified: stats.mtime.toISOString() };
  if (fullPath.endsWith('.md')) {
    try {
      const raw = await fsp.readFile(fullPath, 'utf-8');
      const { meta, body } = parseFrontMatter(raw);
      const lines = body.split(/\r?\n/);
      const titleLine = lines.find(l => l.trim());
      if (titleLine && titleLine.startsWith('#')) {
        result.title = titleLine.replace(/^#+\s*/, '');
      }
      if (lines.length > 1) {
        result.description = lines.slice(1, 3).join(' ').slice(0, 100);
      }
      if (meta.tags) {
        try {
          result.tags = JSON.parse(meta.tags);
        } catch {
          result.tags = String(meta.tags)
            .replace(/^\[/, '')
            .replace(/\]$/, '')
            .split(/,|\r?\n/)
            .map(t => t.replace(/^\s*-?\s*/, '').trim())
            .filter(Boolean);
        }
      }
      if (meta.aliases) {
        try {
          result.aliases = JSON.parse(meta.aliases);
        } catch {
          result.aliases = String(meta.aliases)
            .replace(/^\[/, '')
            .replace(/\]$/, '')
            .split(/,|\r?\n/)
            .map(t => t.replace(/^\s*-?\s*/, '').trim())
            .filter(Boolean);
        }
      }
      if (meta.context_priority) {
        result.context_priority = meta.context_priority;
      }
    } catch {
      // ignore parsing errors
    }
  }
  return result;
}

async function loadIndex() {
  try {
    await fsp.access(indexFilename());
  } catch {
    console.warn('[loadIndex] index.json not found - creating new');
    ensure_dir(indexFilename());
    await fsp.writeFile(indexFilename(), '[]');
    return [];
  }

  try {
    const parsed = JSON.parse(await fsp.readFile(indexFilename(), 'utf-8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('[loadIndex] failed to parse index.json, resetting', e.message);
    await fsp.writeFile(indexFilename(), '[]');
    return [];
  }
}

async function saveIndex(data) {
  ensure_dir(indexFilename());
  if (Array.isArray(data)) {
    for (const entry of data) {
      await safeUpdateIndexEntry(entry);
    }
  } else {
    await safeUpdateIndexEntry(data);
  }
}

async function updateIndexFile(entry, repo, token, userId) {
  const data = await fetchIndex(repo, token);
  const idx = data.findIndex(i => i.path === entry.path);
  if (idx >= 0) {
    data[idx] = { ...data[idx], ...entry };
    opCounts.updated++;
    console.log('[updateIndexFile] updated', entry.path);
  } else {
    data.push(entry);
    opCounts.added++;
    console.log('[updateIndexFile] added', entry.path);
  }
  const clean = await sanitizeIndex(deduplicateEntries(data));
  await persistIndex(clean, repo, token, userId);
  return clean;
}

async function updateIndexFromPath(relPath, repo, token, userId) {
  const fullPath = resolvePath(relPath, 'default');
  try {
    await fsp.access(fullPath);
  } catch {
    return;
  }
  const meta = await extractMeta(fullPath);
  const entry = {
    path: relPath,
    type: categorizeMemoryFile(path.basename(relPath)),
    ...meta,
  };

  await updateIndexFile(entry, repo, token, userId);
}

async function scanMemoryFolderRecursively(repo, token, basePath = 'memory') {
  const files = [];

  async function walk(current) {
    const items = await fsp.readdir(current, { withFileTypes: true });
    for (const item of items) {
      const abs = path.join(current, item.name);
      if (item.isDirectory()) {
        await walk(abs);
      } else if (item.isFile()) {
        const rel = path
          .relative(baseDir('default'), abs)
          .replace(/\\/g, '/');
        if (rel.endsWith('index.json')) {
          logDebug('[scan] skipped', rel, 'index file');
          continue;
        }
        if (/\.(md|txt|json|js|ts|jsx|tsx|html|css|png|jpe?g|svg|gif|py|java|c|cpp|csv)$/i.test(item.name)) {
          files.push(rel);
          logDebug('[scan] file', rel);
        } else {
          logDebug('[scan] skipped', rel, 'unsupported extension');
        }
      }
    }
  }

  const rootPath = resolvePath(basePath, 'default');
  try {
    await fsp.access(rootPath);
    await walk(rootPath);
  } catch {
    // ignore missing rootPath
  }

  const verified = [];
  for (const rel of files) {
    if (await fileExistsInRepo(repo, token, rel)) {
      verified.push(rel);
    } else {
      console.warn(`[scanMemoryFolderRecursively] ${rel} not found in repo`);
    }
  }
  return verified;
}

async function fetchIndex(repo, token) {
  const indexRel = path.relative(baseDir('default'), indexFilename());
  let localData = [];
  let remoteData = [];

  try {
    await fsp.access(indexFilename());
    const parsed = JSON.parse(await fsp.readFile(indexFilename(), 'utf-8'));
    if (Array.isArray(parsed)) localData = parsed;
  } catch (e) {
    if (e.code !== 'ENOENT') console.warn('[fetchIndex] local read error', e.message);
  }

  if (repo && token) {
    try {
      const remote = await github.readFile(token, repo, indexRel);
      const parsedRemote = JSON.parse(remote);
      if (Array.isArray(parsedRemote)) remoteData = parsedRemote;
    } catch (e) {
      if (e.response?.status !== 404) {
        console.error('[fetchIndex] GitHub read error', e.message);
      }
    }
  }

  const map = new Map();
  [...localData, ...remoteData].forEach(entry => {
    if (entry && entry.path) {
      map.set(entry.path, { ...map.get(entry.path), ...entry });
    }
  });

  return Array.from(map.values());
}

async function persistIndex(data, repo, token, userId) {
  ensure_dir(indexFilename());

  const skipGit = process.env.NO_GIT === 'true';
  let finalRepo =
    repo || (userId ? await memory_config.getRepoUrl(userId) : await memory_config.getRepoUrl());
  let finalToken = token || (userId ? await token_store.getToken(userId) : null);
  if (skipGit) {
    finalRepo = null;
    finalToken = null;
  }

  let payload = data;
  if (Array.isArray(data)) {
    payload = await sanitizeIndex(data);
  }

  try {
    if (Array.isArray(payload)) {
      for (const entry of payload) {
        await safeUpdateIndexEntry(entry);
      }
    } else {
      await fsp.writeFile(indexFilename(), JSON.stringify(payload, null, 2));
    }
    console.log('[persistIndex] local index saved');
  } catch (e) {
    console.error('[persistIndex] local write error', e.message);
    throw e;
  }

  if (finalRepo && finalToken) {
    const relRoot = path.relative(baseDir('default'), indexFilename());
    try {
      await github.writeFileSafe(finalToken, finalRepo, relRoot, JSON.stringify(payload, null, 2), 'update index.json');

      if (payload && payload.type === 'index-root' && Array.isArray(payload.branches)) {
        for (const b of payload.branches) {
          const branchAbs = resolvePath(path.join('memory', b.path), 'default');
          try {
            const content = await fsp.readFile(branchAbs, 'utf-8');
            const rel = path.relative(baseDir('default'), branchAbs);
            await github.writeFileSafe(finalToken, finalRepo, rel, content, `update ${b.path}`);
            const dir = path.dirname(branchAbs);
            const base = path.basename(branchAbs, '.json');
            const parts = await fsp.readdir(dir);
            for (const part of parts) {
              if (part.startsWith(base + '.part') && part.endsWith('.json')) {
                const partAbs = path.join(dir, part);
                const partContent = await fsp.readFile(partAbs, 'utf-8');
                const partRel = path.relative(baseDir('default'), partAbs);
                await github.writeFileSafe(finalToken, finalRepo, partRel, partContent, `update ${partRel}`);
              }
            }
          } catch (e) {
            console.error('[persistIndex] push branch error', e.message);
            throw e;
          }
        }
      }

      console.log('[persistIndex] pushed index to GitHub');
    } catch (e) {
      console.error('[persistIndex] GitHub write error', e.message);
      throw e;
    }
  }

  const summary = `[Index Summary] added: ${opCounts.added}, updated: ${opCounts.updated}, skipped: ${opCounts.skipped}, preserved: ${opCounts.preserved}`;
  console.log(summary);
  appendSummaryLog(summary);
  opCounts.added = 0;
  opCounts.updated = 0;
  opCounts.skipped = 0;
  opCounts.preserved = 0;

  return payload;
}

async function updateIndexEntry(repo, token, { path: filePath, type, title, description, lastModified }, userId) {
  if (!filePath) return null;

  const normalized = normalize_memory_path(filePath);
  const indexData = await fetchIndex(repo, token);
  const idx = indexData.findIndex(e => path.posix.normalize(e.path) === normalized);

  const entry = {
    path: normalized,
    type: type || categorizeMemoryFile(path.basename(normalized)),
  };
  if (title !== undefined) entry.title = title;
  if (description !== undefined) entry.description = description;
  entry.lastModified = lastModified || new Date().toISOString();

  let op = 'skipped';
  if (idx >= 0) {
    const existing = indexData[idx];
    const metaChanged =
      existing.type !== entry.type ||
      existing.title !== entry.title ||
      existing.description !== entry.description;
    const timeChanged = existing.lastModified !== entry.lastModified;

    indexData[idx] = { ...existing, ...entry };

    if (metaChanged || timeChanged) {
      op = metaChanged ? 'updated' : 'timestamp';
    }
  } else {
    indexData.push(entry);
    op = 'added';
  }

  const dedupMap = new Map();
  indexData.forEach(e => {
    const p = path.posix.normalize(e.path);
    dedupMap.set(p, { ...dedupMap.get(p), ...e });
  });
  let deduped = Array.from(dedupMap.values());
  deduped = await sanitizeIndex(deduplicateEntries(deduped));
  indexData.length = 0;
  indexData.push(...deduped);

  await persistIndex(indexData, repo, token, userId);
  if (op === 'skipped') {
    opCounts.skipped++;
    logDebug('[updateIndexEntry] skipped', normalized, 'no changes detected');
  } else {
    if (op === 'added') opCounts.added++; else opCounts.updated++;
    console.log('[updateIndexEntry]', op, normalized);
  }
  return entry;
}

async function scanMemoryDir(dirPath) {
  const results = [];

  async function walk(current) {
    const items = await fsp.readdir(current);
    for (const item of items) {
      const abs = path.join(current, item);
      const stats = await fsp.stat(abs);
      if (stats.isDirectory()) {
        await walk(abs);
      } else {
        if (abs === indexFilename) continue;
        const rel = path.relative(baseDir('default'), abs);
        const meta = await extractMeta(abs);
        const idx = index_tree.findEntryByPath(rel) || {};
        results.push({
          path: rel,
          type: categorizeMemoryFile(item),
          tags: meta.tags || idx.tags,
          aliases: meta.aliases || idx.aliases,
          context_priority: meta.context_priority || idx.context_priority,
          ...meta,
        });
      }
    }
  }

  try {
    await fsp.access(dirPath);
    await walk(dirPath);
  } catch {
    // ignore missing dir
  }
  return results;
}

async function rebuildIndex(repo, token, userId) {
  const paths = await scanMemoryFolderRecursively(repo, token);
  const entries = [];
  for (const rel of paths) {
    const abs = path.join(path.join(__dirname, '..'), rel);
    try {
      const meta = await extractMeta(abs);
      entries.push({
        path: rel,
        type: categorizeMemoryFile(path.basename(rel)),
        title: meta.title,
        description: meta.description,
        tags: meta.tags || [],
        aliases: meta.aliases || [],
        context_priority: meta.context_priority || 'medium',
        lastModified: meta.lastModified,
      });
    } catch (e) {
      console.warn(
        `[REBUILD] Не удалось прочитать мета из файла: ${rel}`,
        e.message,
      );
    }
  }

  const clean = await sanitizeIndex(deduplicateEntries(entries));
  await persistIndex(clean, repo, token, userId);

  const rootIndex = {
    type: 'index-root',
    branches: [
      { category: 'lessons', path: 'lessons/index.json' },
      { category: 'plans', path: 'plans/index.json' },
      { category: 'drafts', path: 'drafts/index.json' },
    ],
  };

  const base = path.join(__dirname, '..');
  await fs.promises.writeFile(
    path.join(base, 'memory', 'index.json'),
    JSON.stringify(rootIndex, null, 2),
    'utf-8',
  );

  return clean;
}

async function updateIndexFileManually(newEntries, repo, token, userId) {
  if (!Array.isArray(newEntries)) return [];
  const results = [];
  for (const entry of newEntries) {
    if (!entry.path) continue;
    try {
      const updated = await updateIndexEntry(repo, token, entry, userId);
      if (updated) results.push(updated);
    } catch (e) {
      console.error('[updateIndexFileManually]', e.message);
      throw e;
    }
  }
  return results;
}

async function listMemoryFiles(repo, token, dirPath) {
  if (isLocalMode('default')) {
    const res = await requestToAgent('/listFiles', 'GET', { path: dirPath });
    return Array.isArray(res) ? res : [];
  }
  const directory = dirPath.startsWith('memory') ? dirPath : path.join('memory', dirPath);
  const fullPath = resolvePath(directory, 'default');
  try {
    await fsp.access(fullPath);
  } catch {
    return [];
  }

  const results = [];
  async function walk(current) {
    const entries = await fsp.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(abs);
      } else if (entry.isFile()) {
        const rel = path
          .relative(baseDir('default'), abs)
          .replace(/\\/g, '/');
        if (rel.endsWith('index.json')) continue;
        if (/\.(md|txt|json|js|ts|jsx|tsx|html|css)$/i.test(entry.name)) {
          results.push(rel);
        }
      }
    }
  }

  await walk(fullPath);
  return results;
}
module.exports = {
  updatePlan,
  ensureContext,
  listMemoryFiles,
  writeFileSafe,
  updateOrInsertJsonEntry,
  updateIndexFile,
  updateIndexFileManually,
  scanMemoryFolderRecursively,
  updateIndexEntry,
  rebuildIndex,
  updateIndexFromPath,
  persistIndex,
  fetchIndex,
  loadIndex,
  saveIndex,
  fileExistsInRepo,
  contextFilename,
  planFilename,
  indexFilename,
  scanMemoryDir,
  deduplicateEntries,
  sanitizeIndex,
  safeUpdateIndexEntry,
  readIndexSafe,
  saveContentWithSplitting,
  resolveMemoryReadTarget,
  loadMemorySplitIndex,
  StorageLimitError,
};
