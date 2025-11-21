const express = require('express');
const app = express();
app.use(express.json());

const port = Number(process.env.MOCK_GITHUB_PORT || process.argv[2] || 9999);

function respond(res, payload) {
  res.setHeader('Content-Type', 'application/json');
  res.send(payload);
}

app.get('/user/repos', (_req, res) => {
  respond(res, [
    { id: 1, name: 'mock-repo', full_name: 'mock/mock-repo' },
  ]);
});

app.get('/repos/:owner/:repo/contents/:path(*)?', (req, res) => {
  const filePath = req.params.path || '';
  if (!filePath || filePath === '/') {
    respond(res, [
      { name: 'README.md', path: 'README.md', type: 'file' },
      { name: 'src', path: 'src', type: 'dir' },
    ]);
    return;
  }
  const content = Buffer.from(`# mock content for ${filePath}\n`).toString('base64');
  respond(res, {
    name: filePath,
    path: filePath,
    type: 'file',
    content,
    encoding: 'base64',
  });
});

app.get('/repos/:owner/:repo/git/trees/HEAD', (_req, res) => {
  respond(res, {
    tree: [
      { path: 'README.md', type: 'blob' },
      { path: 'src/index.js', type: 'blob' },
      { path: 'memory/notes/mock.json', type: 'blob' },
    ],
  });
});

app.use((req, res) => {
  res.status(404).json({ message: `Not found: ${req.method} ${req.url}` });
});

app.listen(port, () => {
  console.log(`[mock-github] listening on ${port}`);
});
