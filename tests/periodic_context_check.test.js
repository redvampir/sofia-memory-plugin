process.env.NO_GIT = "true";
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const restore_utils = require('../utils/restore_context');
const memoryMode = require('../utils/memory_mode');
const { contextFilename } = require('../logic/memory_operations');
const originalSetInterval = global.setInterval;

(async function run(){
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'context-test-'));
  const userId = 'testUser';
  const originalRestore = restore_utils.restoreContext;
  const originalLocalPath = process.env.LOCAL_MEMORY_PATH;
  const userConfigPath = path.join(__dirname, '..', 'config', 'users', `${userId}.json`);
  const userRoot = path.join(tempRoot, userId);
  let contextPath = '';

  try {
    global.setInterval = (...args) => {
      const timer = originalSetInterval(...args);
      if (typeof timer?.unref === 'function') timer.unref();
      return timer;
    };
    process.env.LOCAL_MEMORY_PATH = userRoot;
    await memoryMode.setMemoryMode(userId, 'local');
    await memoryMode.setLocalPath(userId, userRoot);

    const userMemoryDir = path.join(userRoot, 'memory');
    fs.mkdirSync(userMemoryDir, { recursive: true });
    contextPath = contextFilename(userId);
    fs.writeFileSync(contextPath, '');

    let called = false;
    restore_utils.restoreContext = async (id) => { called = id === userId; };
    const router = require('../api/memory_routes');

    await router._check_context_for_user(userId);

    assert.ok(called, 'restoreContext should be called when context missing');
    console.log('periodic context check test passed');
  } finally {
    restore_utils.restoreContext = originalRestore;
    global.setInterval = originalSetInterval;
    process.env.LOCAL_MEMORY_PATH = originalLocalPath;
    if (contextPath && fs.existsSync(contextPath)) {
      fs.rmSync(contextPath, { force: true });
    }
    if (fs.existsSync(tempRoot)) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
    if (fs.existsSync(userConfigPath)) {
      fs.rmSync(userConfigPath, { force: true });
    }
  }
})();
