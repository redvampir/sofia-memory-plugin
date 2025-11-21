process.env.NO_GIT = 'true';
const { spawn } = require('child_process');
const path = require('path');
const axios = require('axios');
const assert = require('assert');
const { setMemoryMode } = require('../utils/memory_mode');
const { getDefaultUserId } = require('../utils/default_user');

async function waitForServer(port) {
  for (let i = 0; i < 20; i++) {
    try {
      await axios.get(`http://localhost:${port}/ping`);
      return;
    } catch {
      await new Promise(r => setTimeout(r, 200));
    }
  }
  throw new Error('server did not start');
}

(async function run(){
  const PORT = 15000;
  const userId = getDefaultUserId();
  const env = { ...process.env, PORT: String(PORT) };
  const server = spawn('node', [path.join(__dirname, '..', 'index.js')], { env, stdio: 'inherit' });
  try {
    await waitForServer(PORT);
    const res = await axios.get(`http://localhost:${PORT}/api/switch_memory_repo`, {
      params: { type: 'local', userId },
    });
    assert.deepStrictEqual(res.data, { status: 'ok', mode: 'local' });

    const status = await axios.get(`http://localhost:${PORT}/api/system/status`, { params: { userId } });
    assert.deepStrictEqual(status.data, { status: 'ok', mode: 'local', repo: null });

    console.log('memory mode api tests passed');
  } finally {
    server.kill();
    await setMemoryMode(userId, 'github');
  }
})();
