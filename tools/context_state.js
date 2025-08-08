const fs = require('fs');
const path = require('path');
const SessionSummarizer = require('../src/generator/summarization/SessionSummarizer');

const cache_dir = path.join(__dirname, '.cache');
const state_file = path.join(cache_dir, 'context_state.json');

const TOKEN_LIMIT = 3000;

let state = { _loaded: false, users: {} };
const summarizer = new SessionSummarizer();

function load() {
  if (state._loaded) return;
  try {
    if (fs.existsSync(state_file)) {
      const raw = fs.readFileSync(state_file, 'utf-8');
      const data = JSON.parse(raw);
      if (data && typeof data === 'object') {
        state.users = data.users || {};
      }
    }
  } catch {}
  state._loaded = true;
}

function save() {
  if (!fs.existsSync(cache_dir)) fs.mkdirSync(cache_dir, { recursive: true });
  const data = { users: state.users };
  fs.writeFileSync(state_file, JSON.stringify(data, null, 2), 'utf-8');
}

function ensure(userId) {
  if (!state.users[userId]) {
    state.users[userId] = { needs_refresh: false, tokens: 0, summarized: false };
  }
}
function get_needs_refresh(userId = 'default') {
  load();
  ensure(userId);
  return !!state.users[userId].needs_refresh;
}

function set_needs_refresh(val, userId = 'default') {
  load();
  ensure(userId);
  state.users[userId].needs_refresh = !!val;
  save();
}

function get_tokens(userId = 'default') {
  load();
  ensure(userId);
  return state.users[userId].tokens || 0;
}

function increment_tokens(n = 0, userId = 'default', lastQuestion = '', lastAnswer = '') {
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

function reset_tokens(userId = 'default') {
  load();
  ensure(userId);
  state.users[userId].tokens = 0;
  state.users[userId].summarized = false;
  save();
}

function get_token_limit() {
  return TOKEN_LIMIT;
}

function get_status(userId = 'default') {
  load();
  ensure(userId);
  return { used: state.users[userId].tokens, limit: TOKEN_LIMIT };
}

function register_user_prompt(prompt = '', userId = 'default') {
  const len = typeof prompt === 'string' ? prompt.length : 0;
  increment_tokens(len, userId);
  const triggers = [
    /ты ничего не помнишь/i,
    /ты потеряла контекст/i,
    /вспомни урок/i,
  ];
  if (triggers.some(r => r.test(prompt))) {
    set_needs_refresh(true, userId);
  }
}

module.exports = {
  get_needs_refresh,
  set_needs_refresh,
  get_tokens,
  increment_tokens,
  reset_tokens,
  get_token_limit,
  get_status,
  register_user_prompt,
};
