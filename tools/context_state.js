const fs = require('fs');
const path = require('path');
const SessionSummarizer = require('../src/generator/summarization/SessionSummarizer');

const cacheDir = path.join(__dirname, '.cache');
const stateFile = path.join(cacheDir, 'context_state.json');

const TOKEN_LIMIT = 3000;

let state = { _loaded: false, users: {} };
const summarizer = new SessionSummarizer();

function load() {
  if (state._loaded) return;
  try {
    if (fs.existsSync(stateFile)) {
      const raw = fs.readFileSync(stateFile, 'utf-8');
      const data = JSON.parse(raw);
      if (data && typeof data === 'object') {
        state.users = data.users || {};
      }
    }
  } catch {}
  state._loaded = true;
}

function save() {
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
  const data = { users: state.users };
  fs.writeFileSync(stateFile, JSON.stringify(data, null, 2), 'utf-8');
}

function ensure(userId) {
  if (!state.users[userId]) {
    state.users[userId] = { needs_refresh: false, tokens: 0, summarized: false };
  }
}
function getNeedsRefresh(userId = 'default') {
  load();
  ensure(userId);
  return !!state.users[userId].needs_refresh;
}

function setNeedsRefresh(val, userId = 'default') {
  load();
  ensure(userId);
  state.users[userId].needs_refresh = !!val;
  save();
}

function getTokens(userId = 'default') {
  load();
  ensure(userId);
  return state.users[userId].tokens || 0;
}

function incrementTokens(n = 0, userId = 'default', lastQuestion = '', lastAnswer = '') {
  load();
  ensure(userId);
  state.users[userId].tokens += n;
  if (state.users[userId].tokens > 2000) state.users[userId].needs_refresh = true;
  if (
    state.users[userId].tokens > TOKEN_LIMIT &&
    !state.users[userId].summarized
  ) {
    try {
      const summary = summarizer.summarizePair(lastQuestion, lastAnswer);
      const sessionId = Date.now().toString();
      summarizer.storeSummary(sessionId, summary, lastQuestion, lastAnswer);
    } catch {}
    state.users[userId].summarized = true;
  }
  save();
}

function resetTokens(userId = 'default') {
  load();
  ensure(userId);
  state.users[userId].tokens = 0;
  state.users[userId].summarized = false;
  save();
}

function getTokenLimit() {
  return TOKEN_LIMIT;
}

function getStatus(userId = 'default') {
  load();
  ensure(userId);
  return { used: state.users[userId].tokens, limit: TOKEN_LIMIT };
}

function registerUserPrompt(prompt = '', userId = 'default') {
  const len = typeof prompt === 'string' ? prompt.length : 0;
  incrementTokens(len, userId);
  const triggers = [
    /ты ничего не помнишь/i,
    /ты потеряла контекст/i,
    /вспомни урок/i,
  ];
  if (triggers.some(r => r.test(prompt))) {
    setNeedsRefresh(true, userId);
  }
}

module.exports = {
  // New camelCase names
  getNeedsRefresh,
  setNeedsRefresh,
  getTokens,
  incrementTokens,
  resetTokens,
  getTokenLimit,
  getStatus,
  registerUserPrompt,

  // Backward compatibility (deprecated)
  get_needs_refresh: getNeedsRefresh,
  set_needs_refresh: setNeedsRefresh,
  get_tokens: getTokens,
  increment_tokens: incrementTokens,
  reset_tokens: resetTokens,
  get_token_limit: getTokenLimit,
  get_status: getStatus,
  register_user_prompt: registerUserPrompt,
};
