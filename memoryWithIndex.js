const { githubWriteFileSafe, generateTitleFromPath, inferTypeFromPath } = require('./memory');
const { addOrUpdateEntry, saveIndex } = require('./indexManager');

async function saveMemoryWithIndex(userId, repo, token, filename, content) {
  // Step 1: Save file to GitHub
  await githubWriteFileSafe(token, repo, filename, content, `update ${filename}`);

  // Step 2: Add entry to index
  addOrUpdateEntry({
    path: filename,
    title: generateTitleFromPath(filename),
    type: inferTypeFromPath(filename),
    lastModified: new Date().toISOString()
  });

  // Step 3: Save updated index.json
  await saveIndex(token, repo);
}

module.exports = {
  saveMemoryWithIndex
};
