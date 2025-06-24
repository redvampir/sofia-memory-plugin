const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const { spawnSync } = require('child_process');
const { createBackup } = require('../logic/markdown_editor');

let original_cache = new Map();

function readMarkdownFile(filepath) {
  const abs = path.resolve(filepath);
  let content = '';
  try {
    content = fs.readFileSync(abs, 'utf-8');
  } catch {
    content = '';
  }
  original_cache.set(abs, content);
  return content;
}

function lineSimilarity(a, b) {
  const aSet = new Set(a.split(/\r?\n/));
  const bSet = new Set(b.split(/\r?\n/));
  let same = 0;
  for (const l of aSet) {
    if (bSet.has(l)) same++;
  }
  return bSet.size === 0 && aSet.size === 0 ? 1 : same / Math.max(aSet.size, bSet.size);
}

function previewDiff(oldTxt, newTxt) {
  const tmpDir = os.tmpdir();
  const o = path.join(tmpDir, `orig_${Date.now()}.md`);
  const n = path.join(tmpDir, `new_${Date.now()}.md`);
  fs.writeFileSync(o, oldTxt);
  fs.writeFileSync(n, newTxt);
  const out = spawnSync('diff', ['-u', o, n], { encoding: 'utf8' });
  try { fs.unlinkSync(o); } catch {}
  try { fs.unlinkSync(n); } catch {}
  return out.stdout || 'No differences';
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, a => { rl.close(); resolve(a); }));
}

async function editMarkdownFile(filepath, editCallback, opts = {}) {
  const { dryRun = false, autoConfirm = false } = opts;
  const original = readMarkdownFile(filepath);
  const edited = await Promise.resolve(editCallback(original));
  if (edited === undefined || edited === null) return false;
  const ratio = lineSimilarity(original, edited);
  if (ratio < 0.2) {
    console.warn('[editMarkdownFile] Low similarity between versions');
  }
  if (original !== edited) {
    const diff = previewDiff(original, edited);
    console.log(diff);
  } else {
    return false;
  }
  if (dryRun) return false;
  let confirmed = autoConfirm;
  if (!confirmed) {
    const a = await ask('Apply changes? [y/N] ');
    confirmed = /^y(es)?$/i.test(a.trim());
  }
  if (!confirmed) {
    console.log('Edit cancelled.');
    return false;
  }
  writeMarkdownFile(filepath, edited);
  return true;
}

function writeMarkdownFile(filepath, newContent) {
  const abs = path.resolve(filepath);
  createBackup(abs);
  fs.writeFileSync(abs, newContent, 'utf-8');
  original_cache.delete(abs);
}

module.exports = {
  readMarkdownFile,
  editMarkdownFile,
  writeMarkdownFile
};
