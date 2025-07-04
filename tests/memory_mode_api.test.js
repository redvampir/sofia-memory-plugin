process.env.NO_GIT = 'true';
const { spawn } = require('child_process');
const path = require('path');
const axios = require('axios');
const assert = require('assert');
const { setMemoryMode } = require('../utils/memory_mode');

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
  const env = { ...process.env, PORT: String(PORT) };
  const server = spawn('node', [path.join(__dirname, '..', 'index.js')], { env, stdio: 'inherit' });
  try {
    await waitForServer(PORT);
    const res = await axios.get(`http://localhost:${PORT}/api/switch_memory_repo`, { params: { type: 'local' } });
    assert.deepStrictEqual(res.data, { status: 'ok', mode: 'local' });

    const status = await axios.get(`http://localhost:${PORT}/api/status`);
    assert.strictEqual(status.data.mode, 'local');

    console.log('memory mode api tests passed');
  } finally {
    server.kill();
    await setMemoryMode('default', 'github');
  }
})();
