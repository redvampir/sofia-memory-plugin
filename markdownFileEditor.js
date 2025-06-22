const fs = require('fs');
const path = require('path');
const validator = require('./markdownValidator');
const mdEditor = require('./markdownEditor');
const {
  parseMarkdownStructure,
  serializeMarkdownTree,
  mergeMarkdownTrees
} = require('./markdownMergeEngine.ts');

function ensureDir(p) {
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function createScaffold(filePath) {
  ensureDir(filePath);
  const name = path.basename(filePath).toLowerCase();
  let title = 'Document';
  if (name.includes('checklist')) title = 'Plan Checklist';
  else if (name.includes('plan')) title = 'Plan';
  else if (name.includes('instruction')) title = 'Instructions';
  else if (name.includes('note')) title = 'Notes';
  const lines = [`# ${title}`, '', '## Unsorted'];
  fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
}

function ensureFile(filePath) {
  if (!fs.existsSync(filePath)) {
    createScaffold(filePath);
  }
}

function loadTree(filePath) {
  ensureFile(filePath);
  validator.checkFileExists(filePath);
  const raw = fs.readFileSync(filePath, 'utf-8');
  validator.validateMarkdownSyntax(raw, filePath);
  const tree = parseMarkdownStructure(raw);
  return tree;
}

function writeTree(filePath, tree) {
  const content = serializeMarkdownTree(tree);
  validator.validateMarkdownSyntax(content, filePath);
  const backup = mdEditor.createBackup(filePath);
  fs.writeFileSync(filePath, content, 'utf-8');
  return { updated: true, message: 'file updated', backupPath: backup };
}

function findHeading(nodes, heading) {
  for (const node of nodes) {
    if (node.type === 'heading' && node.text === heading) return node;
    if (node.children) {
      const found = findHeading(node.children, heading);
      if (found) return found;
    }
  }
  return null;
}

function findHeadingPath(nodes, pathArr, level = 0) {
  if (level >= pathArr.length) return null;
  for (const node of nodes) {
    if (node.type === 'heading' && node.text === pathArr[level]) {
      if (level === pathArr.length - 1) return node;
      if (node.children) return findHeadingPath(node.children, pathArr, level + 1);
    }
  }
  return null;
}

function getOrCreateHeading(tree, heading) {
  let h = findHeading(tree, heading);
  if (!h) {
    h = { type: 'heading', level: 2, text: heading, children: [] };
    tree.push(h);
  }
  if (!h.children) h.children = [];
  return h;
}

function addTask(filePath, heading, taskText, checked = false) {
  const tree = loadTree(filePath);
  let h = getOrCreateHeading(tree, heading);
  const exists = (n) =>
    n.type === 'list' && n.children.some((c) => c.type === 'item' && c.text === taskText);
  if (!h.children.find(exists)) {
    h.children.push({
      type: 'list',
      level: 0,
      text: '',
      children: [{ type: 'item', level: 0, text: taskText, checked }]
    });
  }
  return writeTree(filePath, tree);
}

function removeTask(filePath, heading, taskText) {
  const tree = loadTree(filePath);
  const h = findHeading(tree, heading);
  if (!h) return;

  function remove(nodes) {
    return nodes.filter((n) => {
      if (n.type === 'item' && n.text === taskText) {
        return false;
      }
      if (n.children) n.children = remove(n.children);
      return true;
    });
  }

  if (h.children) h.children = remove(h.children);
  return writeTree(filePath, tree);
}

function toggleTaskStatus(filePath, heading, taskText, checked = true) {
  const tree = loadTree(filePath);
  const h = findHeading(tree, heading);
  let target = h && h.children ? h : null;
  let modified = false;
  const walk = nodes => {
    for (const n of nodes) {
      if (n.type === 'item' && n.text === taskText) {
        if (n.checked !== checked) {
          n.checked = checked;
          modified = true;
        }
      }
      if (n.children) walk(n.children);
    }
  };
  if (target) walk(target.children);

  if (!modified) {
    const unsorted = getOrCreateHeading(tree, 'Unsorted');
    unsorted.children.push({
      type: 'list',
      level: 0,
      text: '',
      children: [{ type: 'item', level: 0, text: taskText, checked }]
    });
    return writeTree(filePath, tree);
  }
  return writeTree(filePath, tree);
}

function updateTaskText(filePath, heading, oldText, newText) {
  const tree = loadTree(filePath);
  const h = findHeading(tree, heading);
  if (!h || !h.children)
    return { updated: false, message: 'heading not found' };

  let modified = false;
  const walk = nodes => {
    for (const n of nodes) {
      if (n.type === 'item' && n.text === oldText) {
        if (n.text !== newText) {
          n.text = newText;
          modified = true;
        }
      }
      if (n.children) walk(n.children);
    }
  };
  walk(h.children);

  if (!modified) {
    const unsorted = getOrCreateHeading(tree, 'Unsorted');
    unsorted.children.push({
      type: 'list',
      level: 0,
      text: '',
      children: [{ type: 'item', level: 0, text: newText, checked: false }]
    });
    return writeTree(filePath, tree);
  }
  return writeTree(filePath, tree);
}

function addSection(filePath, heading, lines) {
  const tree = loadTree(filePath);
  let h = findHeading(tree, heading);
  const sectionTree = parseMarkdownStructure(['## ' + heading, ...lines].join('\n'));
  if (!h) {
    tree.push(sectionTree[0]);
  } else {
    h.children = mergeMarkdownTrees(h.children || [], sectionTree[0].children || []);
  }
  return writeTree(filePath, tree);
}

function addSectionPath(filePath, headings, lines) {
  if (!Array.isArray(headings)) headings = [headings];
  const tree = loadTree(filePath);
  let nodes = tree;
  let level = 1;
  let h;
  for (const hText of headings) {
    h = null;
    for (const n of nodes) {
      if (n.type === 'heading' && n.text === hText) {
        h = n;
        break;
      }
    }
    if (!h) {
      h = { type: 'heading', level: level + 1, text: hText, children: [] };
      nodes.push(h);
    }
    nodes = h.children || (h.children = []);
    level += 1;
  }

  const sectionTree = parseMarkdownStructure(lines.join('\n'));
  h.children = mergeMarkdownTrees(h.children || [], sectionTree);
  return writeTree(filePath, tree);
}

function removeSection(filePath, heading) {
  const tree = loadTree(filePath);
  const stack = [{ nodes: tree }];
  while (stack.length) {
    const { nodes } = stack.pop();
    const idx = nodes.findIndex(n => n.type === 'heading' && n.text === heading);
    if (idx >= 0) {
      nodes.splice(idx, 1);
      return writeTree(filePath, tree);
    }
    for (const n of nodes) if (n.children) stack.push({ nodes: n.children });
  }
}

function translateContent(filePath, map) {
  const tree = loadTree(filePath);
  const isCode = txt => /`[^`]+`/.test(txt) || /\w+\.[A-Za-z0-9]+$/.test(txt);
  const walk = nodes => {
    for (const n of nodes) {
      if (n.type === 'heading' || n.type === 'item') {
        if (!isCode(n.text) && map[n.text]) n.text = map[n.text];
      }
      if (n.children) walk(n.children);
    }
  };
  walk(tree);
  return writeTree(filePath, tree);
}

function dedupeTree(nodes) {
  const seenHeadings = new Map();
  const result = [];
  for (const node of nodes) {
    if (node.type === 'heading') {
      const key = `${node.level}:${node.text}`;
      if (seenHeadings.has(key)) {
        const existing = seenHeadings.get(key);
        existing.children = mergeMarkdownTrees(existing.children || [], node.children || []);
        continue;
      } else {
        seenHeadings.set(key, node);
      }
    }
    if (node.type === 'item') {
      // handled in dedupeItems
    }
    if (node.children) node.children = dedupeTree(node.children);
    result.push(node);
  }
  return dedupeItems(result);
}

function dedupeItems(nodes) {
  const result = [];
  const seen = new Map();
  for (const node of nodes) {
    if (node.type === 'item') {
      const key = node.text.toLowerCase();
      if (seen.has(key)) {
        if (node.checked) seen.get(key).checked = true;
        continue;
      }
      seen.set(key, node);
    }
    result.push(node);
  }
  return result;
}

function cleanDuplicates(filePath) {
  const tree = loadTree(filePath);
  const cleaned = dedupeTree(tree);
  return writeTree(filePath, cleaned);
}

module.exports = {
  addTask,
  removeTask,
  toggleTaskStatus,
  updateTaskText,
  addSection,
  addSectionPath,
  removeSection,
  translateContent,
  cleanDuplicates
};
