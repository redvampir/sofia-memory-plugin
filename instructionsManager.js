const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const simpleGit = require('simple-git');
const github = require('./githubClient');

const git = simpleGit();
const SKIP_GIT = process.env.NO_GIT === "true";

const DEFAULT_REPO = 'Test-Sofia';
const DEFAULT_FILE = 'Instructions.md';

const BASE_DIR = path.join(__dirname, 'memory', 'instructions');
const HISTORY_DIR = path.join(BASE_DIR, 'history');
const DEV_DIR = path.join(BASE_DIR, 'dev');

let currentVersion = 'base';

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function ensureStructure() {
  [BASE_DIR, HISTORY_DIR, DEV_DIR].forEach(ensureDir);
}

function versionPath(version) {
  return path.join(BASE_DIR, `${version}.md`);
}

function saveHistory(version) {
  const src = versionPath(version);
  if (!fs.existsSync(src)) return;
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(HISTORY_DIR, `${version}_${ts}.md`);
  fs.copyFileSync(src, dest);
}

async function loadFromGitHub(repo = DEFAULT_REPO, token, file = DEFAULT_FILE, version = 'base') {
  ensureStructure();
  const content = await github.readFile(token, repo, file);
  const dest = versionPath(version);
  fs.writeFileSync(dest, content, 'utf-8');
  if (!SKIP_GIT) {
    await git.add(dest);
    await git.commit(`load instructions ${version} from ${repo}/${file}`);
  }
  return content;
}

function getCurrentVersion() {
  return currentVersion;
}

function getCurrentInstructions() {
  const p = versionPath(currentVersion);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '';
}

function switchVersion(version) {
  ensureStructure();
  const p = versionPath(version);
  if (!fs.existsSync(p)) throw new Error(`Missing instructions for ${version}`);
  currentVersion = version;
  console.log(`[instructionsManager] switched to ${version}`);
  return getCurrentInstructions();
}

function diffStrings(oldStr, newStr) {
  const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'diff-'));
  const a = path.join(tmpDir, 'old.txt');
  const b = path.join(tmpDir, 'new.txt');
  fs.writeFileSync(a, oldStr, 'utf-8');
  fs.writeFileSync(b, newStr, 'utf-8');
  let diff = '';
  try {
    diff = execSync(`diff -u ${a} ${b}`, { encoding: 'utf-8' });
  } catch (e) {
    diff = e.stdout || '';
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
  return diff;
}

async function edit(version, newContent, opts = {}) {
  ensureStructure();
  const devMode = opts.devMode;
  const dest = devMode ? path.join(DEV_DIR, `${version}.md`) : versionPath(version);
  const oldContent = fs.existsSync(versionPath(version)) ? fs.readFileSync(versionPath(version), 'utf-8') : '';

  if (!devMode) saveHistory(version);
  fs.writeFileSync(dest, newContent, 'utf-8');

  if (devMode) {
    const diff = diffStrings(oldContent, newContent);
    console.log(diff);
    return diff;
  }

  if (!SKIP_GIT) {
    await git.add(dest);
    await git.commit(`update ${version} instructions`);
  }
  return dest;
}

function listHistory(version) {
  ensureStructure();
  const prefix = `${version}_`;
  return fs
    .readdirSync(HISTORY_DIR)
    .filter(f => f.startsWith(prefix))
    .sort();
}

async function rollback(version, historyFile) {
  ensureStructure();
  const file = path.join(HISTORY_DIR, historyFile);
  if (!fs.existsSync(file)) throw new Error('History file not found');
  const content = fs.readFileSync(file, 'utf-8');
  await edit(version, content);
  return content;
}

module.exports = {
  loadFromGitHub,
  switchVersion,
  getCurrentInstructions,
  edit,
  rollback,
  listHistory,
  getCurrentVersion,
};
