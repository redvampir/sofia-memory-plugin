const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const simpleGit = require('simple-git');
const github = require('../tools/github_client');
const repoConfig = require('../tools/instructions_repo_config');
const mdEditor = require('./markdown_editor');
const validator = require('./markdown_validator');
const mdFileEditor = require('./markdown_file_editor');
const { ensure_dir, normalize_memory_path } = require('../tools/file_utils');
const { logError } = require('../tools/error_handler');

const git = simpleGit();
const SKIP_GIT = process.env.NO_GIT === "true";

const DEFAULT_REPO = 'Test-Sofia';
const DEFAULT_FILE = 'Instructions.md';

const BASE_DIR = path.join(__dirname, '..', 'memory', 'instructions');
const HISTORY_DIR = path.join(BASE_DIR, 'history');
const DEV_DIR = path.join(BASE_DIR, 'dev');

let currentVersion = 'base';

function ensureStructure() {
  [BASE_DIR, HISTORY_DIR, DEV_DIR].forEach(ensure_dir);
}

function versionPath(version) {
  return path.join(BASE_DIR, `${version}.md`);
}

function syncCurrent() {
  const src = versionPath(currentVersion);
  const dest = path.join(BASE_DIR, 'current.md');
  if (fs.existsSync(src)) fs.copyFileSync(src, dest);
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
  if (!repo || !token) {
    const cfg = repoConfig.getActiveRepoConfig();
    repo = repo || cfg.repo;
    token = token || cfg.token;
  }
  const content = await github.readFile(token, repo, file);
  const dest = versionPath(version);
  const check = validator.validateMarkdownSyntax(content, dest);
  if (!check.valid) {
    logError(
      'loadFromGitHub',
      new Error(`${check.message} at line ${check.line} in '${path.basename(dest)}'`)
    );
    return '';
  }
  mdEditor.createBackup(dest);
  fs.writeFileSync(dest, content, 'utf-8');
  if (!SKIP_GIT) {
    await git.add(dest);
    await git.commit(`load instructions ${version} from ${repo}/${file}`);
  }
  syncCurrent();
  return content;
}

async function load(version = 'base', file = DEFAULT_FILE) {
  ensureStructure();
  const dest = versionPath(version);
  if (fs.existsSync(dest)) {
    currentVersion = version;
    syncCurrent();
    return getCurrentInstructions();
  }
  const student = repoConfig.getStudentRepoConfig();
  if (student.repo && student.token) {
    try {
      repoConfig.setRepoContext('student');
      const c = await loadFromGitHub(student.repo, student.token, file, version);
      currentVersion = version;
      return c;
    } catch (e) {
      console.warn('[instructionsManager] student load failed', e.message);
    }
  }
  const plugin = repoConfig.getPluginRepoConfig();
  if (plugin.repo && plugin.token) {
    repoConfig.setRepoContext('plugin');
    try {
      const c = await loadFromGitHub(plugin.repo, plugin.token, file, version);
      currentVersion = version;
      return c;
    } catch (e) {
      console.warn('[instructionsManager] plugin load failed', e.message);
    }
  }
  const basePath = versionPath('base');
  if (fs.existsSync(basePath)) {
    fs.copyFileSync(basePath, dest);
    currentVersion = version;
    syncCurrent();
    return getCurrentInstructions();
  }
  throw new Error('Instructions not found');
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
  syncCurrent();
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
  const ctx = repoConfig.getRepoContext();
  if (ctx === 'plugin' && !devMode) {
    throw new Error('Plugin instructions are read-only');
  }

  if (!devMode) saveHistory(version);
  const check = validator.validateMarkdownSyntax(newContent, dest);
  if (!check.valid) {
    logError(
      'edit instructions',
      new Error(`${check.message} at line ${check.line} in '${path.basename(dest)}'`)
    );
    return null;
  }
  mdEditor.createBackup(dest);
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
  syncCurrent();
  return dest;
}


async function updateMarkdownFile(relPath, newContent, opts = {}) {
  const normalized = normalize_memory_path(relPath);
  const abs = path.join(__dirname, '..', normalized);
  const devMode = opts.devMode;
  const dest = devMode
    ? path.join(path.dirname(abs), 'dev', path.basename(abs))
    : abs;
  ensure_dir(dest);
  const oldContent = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf-8') : '';
  const check = validator.validateMarkdownSyntax(newContent, dest);
  if (!check.valid) {
    logError(
      'updateMarkdownFile',
      new Error(`${check.message} at line ${check.line} in '${path.basename(dest)}'`)
    );
    return null;
  }
  mdEditor.createBackup(dest);
  fs.writeFileSync(dest, newContent, 'utf-8');

  if (opts.translationMap) {
    mdFileEditor.translateContent(dest, opts.translationMap);
  }
  if (opts.deduplicate) {
    mdFileEditor.cleanDuplicates(dest);
  }

  if (devMode) {
    const diff = diffStrings(oldContent, newContent);
    console.log(diff);
    return diff;
  }
  if (!SKIP_GIT) {
    await git.add(dest);
    await git.commit(`update ${normalized}`);
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
  syncCurrent();
  return content;
}

module.exports = {
  loadFromGitHub,
  load,
  switchVersion,
  getCurrentInstructions,
  edit,
  rollback,
  listHistory,
  getCurrentVersion,
  syncCurrent,
  setRepoContext: repoConfig.setRepoContext,
  getRepoContext: repoConfig.getRepoContext,
  setPluginRepoConfig: repoConfig.setPluginRepoConfig,
  setStudentRepoConfig: repoConfig.setStudentRepoConfig,
  updateMarkdownFile
};
