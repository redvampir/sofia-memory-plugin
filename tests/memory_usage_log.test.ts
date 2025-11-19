import assert from 'assert';
import fs from 'fs';
import path from 'path';

const {
  buildLogEntry,
  logMemoryUsage,
} = require('../src/memory/memory_usage_log');

function readLastLogLine(filePath: string) {
  const raw = fs.readFileSync(filePath, 'utf-8').trim();
  const lines = raw.split('\n').filter(Boolean);
  return JSON.parse(lines[lines.length - 1]);
}

(function run() {
  const tempDir = path.join(__dirname, 'tmp_logs');
  const filePath = path.join(tempDir, 'memory_usage.jsonl');
  fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir, { recursive: true });

  const entry = buildLogEntry({
    user_id: 'u1',
    agent_id: 'a1',
    project: 'demo',
    request_type: 'get_context',
    query: 'find relevant notes',
    memory_ids: ['m1', 'm2'],
    outcome: 'ok',
    notes: 'проверка',
  });

  assert.ok(entry.id, 'должен быть сгенерирован id');
  assert.strictEqual(entry.project, 'demo');
  assert.strictEqual(entry.memory_ids.length, 2);
  assert.strictEqual(entry.outcome, 'ok');

  logMemoryUsage(entry, {
    mode: 'file',
    filePath,
    sqlitePath: path.join(tempDir, 'db.sqlite'),
  }).then(() => {
    const stored = readLastLogLine(filePath);
    assert.strictEqual(stored.project, 'demo');
    assert.deepStrictEqual(stored.memory_ids, ['m1', 'm2']);
    assert.strictEqual(stored.outcome, 'ok');
    assert.strictEqual(stored.notes, 'проверка');
    console.log('memory_usage_log.test.ts: ok');
  }).catch(err => {
    console.error('memory_usage_log.test.ts: failed', err);
    process.exit(1);
  });
})();
