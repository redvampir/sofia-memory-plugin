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
const {
  getRepoInfo,
  categorizeMemoryFile,
  logDebug,
} = require('../tools/memory_helpers');
const memory_settings = require('../tools/memory_settings');

const contextFilename = path.join(__dirname, '..', 'memory', 'context.md');
const planFilename = path.join(__dirname, '..', 'memory', 'plan.md');
const indexFilename = path.join(__dirname, '..', 'memory', 'index.json');

let planCache = null;

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
    await fsp.access(contextFilename);
  } catch {
    ensure_dir(contextFilename);
    await writeFileSafe(contextFilename, '# Context\n');
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
  const absPath = path.join(path.join(__dirname, '..'), relPath);

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
  ensure_dir(planFilename);
  let existed = true;
  try {
    await fsp.access(planFilename);
  } catch {
    existed = false;
  }
  let plan;
  if (existed) {
    try {
      const content = await fsp.readFile(planFilename, 'utf-8');
      plan = parsePlanMarkdown(content);
    } catch {
      plan = { completedLessons: [], requestedClarifications: [], nextLesson: '' };
    }
  } else {
    plan = { completedLessons: [], requestedClarifications: [], nextLesson: '' };
  }

  plan = await updatePlanFromIndex(plan);
  await writeFileSafe(planFilename, planToMarkdown(plan));
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
  await writeFileSafe(planFilename, md);
  if (repo && token) {
    try {
      await github.writeFileSafe(
        token,
        repo,
        path.relative(path.join(__dirname, '..'), planFilename),
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
    if (tokens > memory_settings.token_soft_limit && memory_settings.enforce_soft_limit) {
      console.warn('[writeFileSafe] token limit reached', tokens);
      return;
    }
    await fsp.writeFile(filePath, data, 'utf-8');
    logDebug('[writeFileSafe] wrote', filePath);
  } catch (e) {
    console.error(`[writeFileSafe] Error writing ${filePath}`, e.message);
    throw e;
  }
}


async function updateOrInsertJsonEntry(filePath, newData, matchKey, repo, token) {
  ensure_dir(filePath);
  const relPath = path.relative(path.join(__dirname, '..'), filePath);
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
      const lines = (await fsp.readFile(fullPath, 'utf-8')).split(/\r?\n/);
      const titleLine = lines.find(l => l.trim());
      if (titleLine && titleLine.startsWith('#')) {
        result.title = titleLine.replace(/^#+\s*/, '');
      }
      if (lines.length > 1) {
        result.description = lines.slice(1, 3).join(' ').slice(0, 100);
      }
    } catch {
      // ignore parsing errors
    }
  }
  return result;
}

async function loadIndex() {
  try {
    await fsp.access(indexFilename);
  } catch {
    console.warn('[loadIndex] index.json not found - creating new');
    ensure_dir(indexFilename);
    await writeFileSafe(indexFilename, '[]');
    return [];
  }

  try {
    const parsed = JSON.parse(await fsp.readFile(indexFilename, 'utf-8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('[loadIndex] failed to parse index.json, resetting', e.message);
    await writeFileSafe(indexFilename, '[]');
    return [];
  }
}

async function saveIndex(data) {
  ensure_dir(indexFilename);
  await writeFileSafe(indexFilename, JSON.stringify(data, null, 2));
}

async function updateIndexFile(entry, repo, token, userId) {
  const data = await fetchIndex(repo, token);
  const idx = data.findIndex(i => i.path === entry.path);
  if (idx >= 0) {
    data[idx] = { ...data[idx], ...entry };
    console.log('[updateIndexFile] updated', entry.path);
  } else {
    data.push(entry);
    console.log('[updateIndexFile] added', entry.path);
  }
  const clean = await sanitizeIndex(deduplicateEntries(data));
  await persistIndex(clean, repo, token, userId);
  return clean;
}

async function updateIndexFromPath(relPath, repo, token, userId) {
  const fullPath = path.join(path.join(__dirname, '..'), relPath);
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
          .relative(path.join(__dirname, '..'), abs)
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

  const rootPath = path.join(path.join(__dirname, '..'), basePath);
  try {
    await fsp.access(rootPath);
    await walk(rootPath);
  } catch {
    // ignore missing rootPath
  }

  const verified = [];
  for (const rel of files) {
    // eslint-disable-next-line no-await-in-loop
    if (await fileExistsInRepo(repo, token, rel)) {
      verified.push(rel);
    } else {
      console.warn(`[scanMemoryFolderRecursively] ${rel} not found in repo`);
    }
  }
  return verified;
}

async function fetchIndex(repo, token) {
  const indexRel = path.relative(path.join(__dirname, '..'), indexFilename);
  let localData = [];
  let remoteData = [];

  try {
    await fsp.access(indexFilename);
    const parsed = JSON.parse(await fsp.readFile(indexFilename, 'utf-8'));
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
  ensure_dir(indexFilename);

  const finalRepo =
    repo || (userId ? await memory_config.getRepoUrl(userId) : await memory_config.getRepoUrl());
  const finalToken = token || (userId ? await token_store.getToken(userId) : null);

  let payload = data;
  if (Array.isArray(data)) {
    payload = await sanitizeIndex(data);
  }

  try {
    await writeFileSafe(indexFilename, JSON.stringify(payload, null, 2));
    console.log('[persistIndex] local index saved');
  } catch (e) {
    console.error('[persistIndex] local write error', e.message);
    throw e;
  }

  if (finalRepo && finalToken) {
    const relRoot = path.relative(path.join(__dirname, '..'), indexFilename);
    try {
      await github.writeFileSafe(finalToken, finalRepo, relRoot, JSON.stringify(payload, null, 2), 'update index.json');

      if (payload && payload.type === 'index-root' && Array.isArray(payload.branches)) {
        for (const b of payload.branches) {
          const branchAbs = path.join(path.join(__dirname, '..', 'memory'), b.path);
          try {
            const content = await fsp.readFile(branchAbs, 'utf-8');
            const rel = path.relative(path.join(__dirname, '..'), branchAbs);
            await github.writeFileSafe(finalToken, finalRepo, rel, content, `update ${b.path}`);
            const dir = path.dirname(branchAbs);
            const base = path.basename(branchAbs, '.json');
            const parts = await fsp.readdir(dir);
            for (const part of parts) {
              if (part.startsWith(base + '.part') && part.endsWith('.json')) {
                const partAbs = path.join(dir, part);
                const partContent = await fsp.readFile(partAbs, 'utf-8');
                const partRel = path.relative(path.join(__dirname, '..'), partAbs);
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
    logDebug('[updateIndexEntry] skipped', normalized, 'no changes detected');
  } else {
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
        const rel = path.relative(path.join(__dirname, '..'), abs);
        const meta = await extractMeta(abs);
        results.push({
          path: rel,
          type: categorizeMemoryFile(item),
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
    const meta = await extractMeta(abs);
    entries.push({
      path: rel,
      type: categorizeMemoryFile(path.basename(rel)),
      title: meta.title,
      description: meta.description,
      lastModified: meta.lastModified,
    });
  }

  const clean = await sanitizeIndex(deduplicateEntries(entries));
  await persistIndex(clean, repo, token, userId);
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
  const directory = dirPath.startsWith('memory') ? dirPath : path.join('memory', dirPath);
  const fullPath = path.join(path.join(__dirname, '..'), directory);
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
          .relative(path.join(__dirname, '..'), abs)
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
  readIndexSafe,
};
