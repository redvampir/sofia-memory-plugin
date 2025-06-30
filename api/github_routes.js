const express = require('express');
const router = express.Router();
const { listUserRepos, getRepoContents, fetchFileContent, saveRepositoryData } = require('../logic/github_repo');
const { lintText } = require('../utils/code_analyzer');

router.post('/github/repos', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ status: 'error', message: 'Missing token' });
  try {
    const data = await listUserRepos(token);
    res.json({ status: 'success', repos: data });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

router.post('/github/repository', async (req, res) => {
  const { token, owner, repo, path = '', page = 1 } = req.body;
  if (!token || !owner || !repo) return res.status(400).json({ status: 'error', message: 'Missing parameters' });
  try {
    const data = await getRepoContents(token, owner, repo, path, page);
    await saveRepositoryData(owner, repo, data);
    res.json({ status: 'success', contents: data });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

router.post('/github/file', async (req, res) => {
  const { token, owner, repo, filePath } = req.body;
  if (!token || !owner || !repo || !filePath) return res.status(400).json({ status: 'error', message: 'Missing parameters' });
  try {
    const content = await fetchFileContent(token, owner, repo, filePath);
    const lint = await lintText(content);
    res.json({ status: 'success', content, lint });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

module.exports = router;
