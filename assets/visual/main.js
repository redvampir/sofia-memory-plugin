async function loadFiles() {
  try {
    const res = await fetch('/visual/files');
    const files = await res.json();
    renderTree(files);
  } catch (err) {
    console.error('Failed to load files', err);
  }
}

function buildTree(paths) {
  const tree = {};
  for (const p of paths) {
    const parts = p.split('/');
    let current = tree;
    for (const part of parts) {
      current[part] = current[part] || {};
      current = current[part];
    }
  }
  return tree;
}

function renderTree(paths) {
  const container = document.getElementById('file-tree');
  container.innerHTML = '';
  const tree = buildTree(paths);
  const ul = document.createElement('ul');
  renderNode(tree, ul);
  container.appendChild(ul);
}

function renderNode(node, parent) {
  for (const name of Object.keys(node)) {
    const li = document.createElement('li');
    li.textContent = name;
    parent.appendChild(li);
    const children = node[name];
    if (children && Object.keys(children).length) {
      const ul = document.createElement('ul');
      li.appendChild(ul);
      renderNode(children, ul);
    }
  }
}

loadFiles();
