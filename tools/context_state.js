const fs = require('fs');
const path = require('path');

const cache_dir = path.join(__dirname, '.cache');
const state_file = path.join(cache_dir, 'context_state.json');

const TOKEN_LIMIT = 3000;

let state = { needs_refresh: false, tokens: 0, _loaded: false };

function load() {
  if (state._loaded) return;
  try {
    if (fs.existsSync(state_file)) {
      const raw = fs.readFileSync(state_file, 'utf-8');
      const data = JSON.parse(raw);
      state.needs_refresh = !!data.needs_refresh;
      state.tokens = data.tokens || 0;
    }
  } catch {}
  state._loaded = true;
}

function save() {
  if (!fs.existsSync(cache_dir)) fs.mkdirSync(cache_dir, { recursive: true });
  const data = { needs_refresh: state.needs_refresh, tokens: state.tokens };
  fs.writeFileSync(state_file, JSON.stringify(data, null, 2), 'utf-8');
}

function get_needs_refresh() {
  load();
  return !!state.needs_refresh;
}

function set_needs_refresh(val) {
  load();
  state.needs_refresh = !!val;
  save();
}

function get_tokens() {
  load();
  return state.tokens || 0;
}

function increment_tokens(n = 0) {
  load();
  state.tokens += n;
  if (state.tokens > 2000) state.needs_refresh = true;
  save();
}

function reset_tokens() {
  load();
  state.tokens = 0;
  save();
}

function get_token_limit() {
  return TOKEN_LIMIT;
}

function get_status() {
  load();
  return { used: state.tokens, limit: TOKEN_LIMIT };
}

function register_user_prompt(prompt = '') {
  const len = typeof prompt === 'string' ? prompt.length : 0;
  increment_tokens(len);
  const triggers = [
    /ты ничего не помнишь/i,
    /ты потеряла контекст/i,
    /вспомни урок/i,
  ];
  if (triggers.some(r => r.test(prompt))) {
    set_needs_refresh(true);
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
