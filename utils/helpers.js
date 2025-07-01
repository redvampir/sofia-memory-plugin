// Вспомогательные функции для плагина памяти Софии

const token_store = require('../tools/token_store');
const memory_config = require('../tools/memory_config');

/**
 * Parse a chat command that configures memory settings for a user.
 *
 * Expected format (order may vary):
 *   "set memory for <userId> repo <repoUrl> token <ghp_xxx>"
 *
 * @param {string} message - raw chat text
 * @returns {{userId: string, repo: string, token: string}|null}
 */
// Разбор команды настройки памяти пользователя
async function parse_user_memory_setup(message = '') {
  if (typeof message !== 'string') return null;

  const userMatch = message.match(/(?:for|user)\s+([\w_]+)/i);
  const repoMatch = message.match(/repo\s+(https?:\/\/github\.com\/[\w.-]+\/[\w.-]+\.git\/?)/i);
  const tokenMatch = message.match(/token\s+(ghp_[A-Za-z0-9]+)/i);

  if (!userMatch || !repoMatch || !tokenMatch) return null;

  const userId = userMatch[1];
  let repo = repoMatch[1].replace(/\/?$/, '');
  const token = tokenMatch[1];

  if (!/^[\w_]+$/.test(userId)) {
    console.warn('[parse_user_memory_setup] invalid userId', userId);
    return null;
  }
  if (!/^ghp_[A-Za-z0-9]+$/.test(token)) {
    console.warn('[parse_user_memory_setup] invalid token format');
    return null;
  }
  if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\.git$/.test(repo)) {
    console.warn('[parse_user_memory_setup] invalid repo url');
    return null;
  }

  await token_store.setToken(userId, token);
  await memory_config.setRepoUrl(userId, repo);
  console.log(`[MemorySetup] Configured user: ${userId}`);

  return { userId, repo, token };
}

// Parse command like "\u0421\u043e\u0445\u0440\u0430\u043d\u0438 \u044d\u0442\u043e \u043a\u0430\u043a \u044d\u0442\u0430\u043b\u043e\u043d\u043d\u044b\u0439 \u043e\u0442\u0432\u0435\u0442 key"
function parse_save_reference_answer(message = '') {
  if (typeof message !== 'string') return null;
  const m = message.match(/сохрани это как эталонный ответ\s+(\S+)/i);
  if (!m) return null;
  return { key: m[1] };
}

// Parse command like "\u0417\u0430\u0433\u0440\u0443\u0437\u0438 answers/file.md \u0432 \u0442\u0435\u043a\u0443\u0449\u0438\u0439 \u0434\u0438\u0430\u043b\u043e\u0433"
function parse_manual_load_command(message = '') {
  if (typeof message !== 'string') return null;
  const m = message.match(/загрузи\s+(\S+)\s+в\s+текущий\s+диалог/i);
  if (!m) return null;
  return { path: m[1] };
}

function parse_set_local_path(message = '') {
  if (typeof message !== 'string') return null;
  const m = message.match(/\/set_local_path\s+path="([^"]+)"/i);
  if (!m) return null;
  return { path: m[1] };
}

function parse_set_memory_folder(message = '') {
  if (typeof message !== 'string') return null;
  const m = message.match(/\/set_memory_folder\s+name="([^"]+)"/i);
  if (!m) return null;
  return { name: m[1] };
}

function parse_switch_memory_folder(message = '') {
  if (typeof message !== 'string') return null;
  const m = message.match(/\/switch_memory_folder\s+name="([^"]+)"/i);
  if (!m) return null;
  return { name: m[1] };
}

function parse_list_memory_folders(message = '') {
  if (typeof message !== 'string') return null;
  return /\/list_memory_folders/i.test(message) ? {} : null;
}

function parse_switch_memory_repo(message = '') {
  if (typeof message !== 'string') return null;
  const m = message.match(/\/switch_memory_repo\s+type=(\w+)\s+path="([^"]+)"/i);
  if (!m) return null;
  return { type: m[1], path: m[2] };
}

module.exports = {
  parse_user_memory_setup,
  parse_save_reference_answer,
  parse_manual_load_command,
  parse_set_local_path,
  parse_set_memory_folder,
  parse_switch_memory_folder,
  parse_list_memory_folders,
  parse_switch_memory_repo,
};

