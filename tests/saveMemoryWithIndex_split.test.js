process.env.NO_GIT = "true";
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const index_manager = require('../logic/index_manager');
const index_tree = require('../tools/index_tree');
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

  const rel = 'memory/drafts/tmp_split_index/big.md';
  const dir = path.join(__dirname, '..', 'memory', 'drafts', 'tmp_split_index');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const content = '# Big\n\n' + 'a'.repeat(MAX_MD_FILE_SIZE + 1024);
  const result = await index_manager.saveMemoryWithIndex(null, null, null, rel, content);
  assert.ok(result && result.split, 'should split file');

  result.parts.forEach(p => {
    const abs = path.join(__dirname, '..', p);
    assert.ok(fs.existsSync(abs), `part ${abs} exists`);
  });

  await index_manager.loadIndex();
  result.parts.forEach(p => {
    const entry = index_tree.findEntryByPath(p);
    assert.ok(entry, `${p} present in index`);
  });

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

  console.log('saveMemoryWithIndex split index test passed');
})();
