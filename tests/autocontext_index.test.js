process.env.NO_GIT = "true";
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { load_context_from_index, setMemoryRepo } = require('../memory');
const { contextFilename } = require('../logic/memory_operations');

async function run() {
  setMemoryRepo(null, null);
  const idx_rel = 'memory/context/autocontext-index-test.md';
  const idx_abs = path.join(__dirname, '..', idx_rel);

  const file1_rel = 'memory/lessons/auto_intro_test.md';
  const file2_rel = 'memory/answers/vector_basics_test.md';
  const file3_rel = 'memory/notes/setup_instructions_test.md';
  const file1_abs = path.join(__dirname, '..', file1_rel);
  const file2_abs = path.join(__dirname, '..', file2_rel);
  const file3_abs = path.join(__dirname, '..', file3_rel);

  fs.writeFileSync(file1_abs, '# Intro Auto');
  fs.mkdirSync(path.dirname(file2_abs), { recursive: true });
  fs.writeFileSync(file2_abs, 'Vector');
  fs.mkdirSync(path.dirname(file3_abs), { recursive: true });
  fs.writeFileSync(file3_abs, 'Setup');

  const index_content = [
    '---',
    'project: "sophia-intelligence-core"',
    'context_priority: high',
    'created: 2025-06-25',
    'summary: Example index',
    'files:',
    `  - ${file1_rel}`,
    `  - ${file2_rel}`,
    `  - ${file3_rel}`,
    '---',
    ''
  ].join('\n');
  fs.writeFileSync(idx_abs, index_content);

  const manual = await load_context_from_index(idx_rel);
  assert.ok(manual && manual.files.includes(file2_rel));
  assert.ok(fs.readFileSync(contextFilename, 'utf-8').includes('Vector'));

  fs.writeFileSync(contextFilename, '');
  fs.unlinkSync(file1_abs);
  fs.unlinkSync(file2_abs);
  fs.unlinkSync(file3_abs);
  fs.unlinkSync(idx_abs);
  console.log('autocontext index tests passed');
}

run();
