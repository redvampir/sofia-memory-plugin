const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { isLocalMode } = require('../utils/memory_mode');
const { RegenerateSession } = require('./regenerate_session');

const localCfgPath = path.join(__dirname, '..', 'config', 'local_config.json');

let localMemoryPath = null;

function loadLocalPath() {
  try {
    const raw = fs.readFileSync(localCfgPath, 'utf-8');
    const cfg = JSON.parse(raw);
    localMemoryPath = cfg.path || null;
  } catch {}
}

function saveLocalPath(dir) {
  try {
    fs.mkdirSync(path.dirname(localCfgPath), { recursive: true });
    fs.writeFileSync(localCfgPath, JSON.stringify({ path: dir }, null, 2));
  } catch {}
}

loadLocalPath();

async function requestToAgent(endpoint, method = 'GET', data = {}) {
  const baseUrl = 'http://localhost:4465';
  const payload = { ...data };
  if (localMemoryPath) payload.base_path = localMemoryPath;
  try {
    const response = await axios({
      method,
      url: `${baseUrl}${endpoint}`,
      data: payload,
      params: method.toUpperCase() === 'GET' ? payload : undefined,
    });
    return response.data;
  } catch (error) {
    console.error(
      '\u274c \u041e\u0448\u0438\u0431\u043a\u0430 \u043f\u0440\u0438 \u0437\u0430\u043f\u0440\u043e\u0441\u0435 \u043a \u043b\u043e\u043a\u0430\u043b\u044c\u043d\u043e\u043c\u0443 \u0430\u0433\u0435\u043d\u0442\u0443:',
      error.message
    );
    throw error;
  }
}

async function setLocalPathCommand(text) {
  const m = text.match(/\/set_local_path\s+path="([^"]+)"/i);
  if (!m) return null;
  const newPath = m[1];
  if (!isLocalMode('default')) {
    console.log('\u274c \u041a\u043e\u043c\u0430\u043d\u0434\u0430 \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u0430 \u0442\u043e\u043b\u044c\u043a\u043e \u0432 \u043b\u043e\u043a\u0430\u043b\u044c\u043d\u043e\u043c \u0440\u0435\u0436\u0438\u043c\u0435.');
    return { status: 'error', message: 'Команда доступна только в локальном режиме.' };
  }
  try {
    const result = await requestToAgent('/set_local_path', 'POST', { path: newPath });
    console.log('[memory_plugin] set_local_path status:', result.status || 'OK');
    localMemoryPath = newPath;
    saveLocalPath(newPath);
    return result;
  } catch (e) {
    console.error('[memory_plugin] set_local_path failed', e.message);
    throw e;
  }
}

async function saveMemoryWithIndex(params = {}) {
  if (!isLocalMode(params.userId || 'default')) return null;
  return requestToAgent('/saveMemoryWithIndex', 'POST', params);
}

async function loadMemoryToContext(params = {}) {
  if (!isLocalMode(params.userId || 'default')) return null;
  return requestToAgent('/loadMemoryToContext', 'POST', params);
}

async function listFiles(params = {}) {
  if (!isLocalMode(params.userId || 'default')) return null;
  return requestToAgent('/listFiles', 'GET', params);
}

async function read(params = {}) {
  if (!isLocalMode(params.userId || 'default')) return null;
  return requestToAgent('/read', 'GET', params);
}

let regenSession = null;

async function regenerateCommand(text, generate, opts = {}) {
  const trimmed = text.trim();
  if (!regenSession) {
    if (!/^\/regenerate/i.test(trimmed)) return null;
    regenSession = new RegenerateSession(opts.originalAnswer, opts);
    return { status: 'started', attemptsLeft: regenSession.remaining() };
  }
  if (/^\/accept/i.test(trimmed)) {
    const final = regenSession.accept();
    regenSession = null;
    return { status: 'accepted', answer: final };
  }
  if (/^\/cancel/i.test(trimmed)) {
    regenSession.cancel();
    regenSession = null;
    return { status: 'canceled' };
  }
  if (regenSession.isLimitReached()) {
    const answer = regenSession.currentAnswer || regenSession.originalAnswer;
    regenSession = null;
    return { status: 'limit_reached', answer };
  }
  if (/^\/reject/i.test(trimmed)) {
    return { status: 'rejected', attemptsLeft: regenSession.remaining() };
  }
  if (typeof generate !== 'function') {
    return { status: 'error', message: 'No generator provided' };
  }
  const result = await generate(trimmed, regenSession);
  const answer = typeof result === 'string' ? result : result.answer;
  const fragments = result && result.fragments ? result.fragments : [];
  regenSession.recordAttempt(trimmed, answer, fragments);
  return {
    status: regenSession.isLimitReached() ? 'limit_reached' : 'regenerated',
    answer,
    attemptsLeft: regenSession.remaining(),
  };
}

async function markImportantCommand(text) {
  const m = text.match(/\/mark\s+important\s+([^\s]+)\s*/i);
  if (!m) return null;
  const file = m[1];
  if (!isLocalMode('default')) {
    console.log('\u274c \u041a\u043e\u043c\u0430\u043d\u0434\u0430 \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u0430 \u0442\u043e\u043b\u044c\u043a\u043e \u0432 \u043b\u043e\u043a\u0430\u043b\u044c\u043d\u043e\u043c \u0440\u0435\u0436\u0438\u043c\u0435.');
    return { status: 'error', message: 'Команда доступна только в локальном режиме.' };
  }
  try {
    const result = await requestToAgent('/mark_important', 'POST', { file });
    console.log(`[memory_plugin] mark_important ${file}:`, result.status || 'OK');
    return result;
  } catch (e) {
    console.error('[memory_plugin] mark_important failed', e.message);
    throw e;
  }
}

module.exports = {
  requestToAgent,
  setLocalPathCommand,
  saveMemoryWithIndex,
  loadMemoryToContext,
  listFiles,
  read,
  markImportantCommand,
  regenerateCommand,
};
