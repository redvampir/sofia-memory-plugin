process.env.NO_GIT = "true";
const instructions = require('../instructionsManager');

async function run() {
  console.log('Current version:', instructions.getCurrentVersion());
  console.log('Base content:\n', instructions.getCurrentInstructions().trim());

  console.log('\nSwitching to developer');
  instructions.switchVersion('developer');
  console.log('Version after switch:', instructions.getCurrentVersion());

  let content = instructions.getCurrentInstructions();
  const newContent = content + '\nTemporary debug line.';
  console.log('\nEditing in dev mode');
  await instructions.edit('developer', newContent, { devMode: true });

  console.log('\nCommitting edit');
  await instructions.edit('developer', newContent, { devMode: true });

  console.log('\nSwitching back to base');
  instructions.switchVersion('base');
  console.log('Current version:', instructions.getCurrentVersion());
}

run();
