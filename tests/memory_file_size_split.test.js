process.env.NO_GIT = "true";
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { save_memory_with_index } = require('../src/storage');
const index_manager = require('../logic/index_manager');
const { MAX_MD_FILE_SIZE } = require('../utils/file_splitter');
const settings = require('../tools/memory_settings');
const { indexSettings } = require('../logic/index_validator');

(async function run() {
  const rootIdx = path.join(__dirname, '..', 'memory', 'index.json');
  const draftsIdx = path.join(__dirname, '..', 'memory', 'drafts', 'index.json');
  const origRoot = fs.readFileSync(rootIdx, 'utf-8');
  const origDrafts = fs.readFileSync(draftsIdx, 'utf-8');

  const origMax = settings.max_tokens_per_file;
  const origSoft = settings.token_soft_limit;
  const origEnforce = settings.enforce_soft_limit;
  settings.max_tokens_per_file = Infinity;
  settings.token_soft_limit = Infinity;
  settings.enforce_soft_limit = false;
  const origValidate = indexSettings.validate_on_load;
  const origInvalid = indexSettings.auto_clean_invalid;
  const origMissing = indexSettings.auto_clean_missing;
  indexSettings.validate_on_load = false;
  indexSettings.auto_clean_invalid = false;
  indexSettings.auto_clean_missing = false;

  const rel = 'memory/drafts/tmp_size/big.md';
  const dir = path.join(__dirname, '..', 'memory', 'drafts', 'tmp_size');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const content = '# Big\n\n' + 'a'.repeat(MAX_MD_FILE_SIZE + 1024);
  await save_memory_with_index(null, null, null, rel, content);

  const part1 = path.join(dir, 'big_part1.md');
  const part2 = path.join(dir, 'big_part2.md');
  assert.ok(fs.existsSync(part1), 'part1 exists');
  assert.ok(fs.existsSync(part2), 'part2 exists');



  fs.rmSync(dir, { recursive: true, force: true });
  fs.writeFileSync(rootIdx, origRoot, 'utf-8');
  fs.writeFileSync(draftsIdx, origDrafts, 'utf-8');
  fs.readdirSync(path.join(__dirname, '..', 'memory', 'drafts'))
    .filter(f => f.startsWith('index.part') && f.endsWith('.json'))
    .forEach(f => fs.rmSync(path.join(__dirname, '..', 'memory', 'drafts', f), { force: true }));
  await index_manager.loadIndex();

  settings.max_tokens_per_file = origMax;
  settings.token_soft_limit = origSoft;
  settings.enforce_soft_limit = origEnforce;
  indexSettings.validate_on_load = origValidate;
  indexSettings.auto_clean_invalid = origInvalid;
  indexSettings.auto_clean_missing = origMissing;

  console.log('memory file size split test passed');
})();
