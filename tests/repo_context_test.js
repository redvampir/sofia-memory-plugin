process.env.NO_GIT = "true";
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const instructions = require('../logic/instructions_manager');
const repoCfg = require('../tools/instructions_repo_config');

async function run() {
  repoCfg.setPluginRepoConfig('pluginRepo', null);
  repoCfg.setStudentRepoConfig('studentRepo', null);

  // remove student file if exists
  const studentPath = path.join(__dirname, '..', 'memory', 'instructions', 'student.md');
  if (fs.existsSync(studentPath)) fs.unlinkSync(studentPath);

  repoCfg.setRepoContext('student');
  await instructions.load('student');
  const basePath = path.join(__dirname, '..', 'memory', 'instructions', 'base.md');
  const baseContent = fs.readFileSync(basePath, 'utf-8').trim();
  assert.strictEqual(instructions.getCurrentInstructions().trim(), baseContent);

  const editContent = instructions.getCurrentInstructions() + '\nStudent line';
  await instructions.edit('student', editContent);
  assert.ok(fs.readFileSync(studentPath, 'utf-8').includes('Student line'));
  assert.ok(!fs.readFileSync(basePath, 'utf-8').includes('Student line'));

  repoCfg.setRepoContext('plugin');
  instructions.switchVersion('base');
  assert.strictEqual(instructions.getCurrentVersion(), 'base');
  repoCfg.setRepoContext('student');
  instructions.switchVersion('student');
  assert.strictEqual(instructions.getCurrentVersion(), 'student');

  const history = instructions.listHistory('student');
  await instructions.rollback('student', history[0]);
  assert.ok(!instructions.getCurrentInstructions().includes('Student line'));
  repoCfg.setRepoContext('plugin');
  instructions.switchVersion('base');
  assert.ok(!instructions.getCurrentInstructions().includes('Student line'));

  console.log('repo context tests passed');
}
run();
