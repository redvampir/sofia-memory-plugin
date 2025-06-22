const fs = require('fs');
const path = require('path');
const validator = require('./markdownValidator');
const mdEditor = require('./markdownEditor');
const {
  parseMarkdownStructure,
  serializeMarkdownTree,
  mergeMarkdownTrees
} = require('./markdownMergeEngine.ts');
const { ensureDir } = require('./utils/fileUtils');

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
  const check = validator.validateMarkdownSyntax(content, filePath);
  if (!check.valid) {
    console.error(
      `[writeTree] ${check.message} at line ${check.line} in '${path.basename(filePath)}'`
    );
    return { updated: false, message: 'validation failed', backupPath: null };
  }
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

function findItem(nodes, text) {
  for (const [i, n] of nodes.entries()) {
    if (n.type === 'item' && n.text === text) return { node: n, index: i, parent: nodes };
    if (n.children) {
      const found = findItem(n.children, text);
      if (found) return found;
    }
  }
  return null;
}

function getOrCreateList(node, level) {
  if (level === undefined) {
    if (node.type === 'item') level = (node.level || 0) + 1;
    else if (node.type === 'list') level = node.level;
    else level = 0;
  }
  if (!node.children) node.children = [];
  let list = node.children.find(c => c.type === 'list' && c.level === level);
  if (!list) {
    list = { type: 'list', level, text: '', children: [] };
    node.children.push(list);
  }
  return list;
}

function insertTask(filePath, heading, taskText, opts = {}) {
  const tree = loadTree(filePath);
  const h = getOrCreateHeading(tree, heading);
  let targetNode = h;
  if (opts.parent) {
    const parentFound = findItem(h.children, opts.parent);
    if (parentFound) {
      targetNode = parentFound.node;
    } else {
      const list = getOrCreateList(h);
      const pItem = { type: 'item', level: list.level, text: opts.parent, checked: false, children: [] };
      list.children.push(pItem);
      targetNode = pItem;
    }
  }

  const list = getOrCreateList(targetNode);
  if (list.children.some(c => c.type === 'item' && c.text === taskText)) {
    const existing = list.children.find(c => c.type === 'item' && c.text === taskText);
    if (opts.checked !== undefined) existing.checked = opts.checked;
    return writeTree(filePath, tree);
  }

  const item = { type: 'item', level: list.level, text: taskText, checked: opts.checked ?? false };

  let idx = list.children.length;
  if (opts.before) {
    const i = list.children.findIndex(c => c.type === 'item' && c.text === opts.before);
    if (i >= 0) idx = i;
  } else if (opts.after) {
    const i = list.children.findIndex(c => c.type === 'item' && c.text === opts.after);
    if (i >= 0) idx = i + 1;
  }

  list.children.splice(idx, 0, item);
  return writeTree(filePath, tree);
}

function updateChecklistItem(filePath, heading, itemText, opts = {}) {
  const tree = loadTree(filePath);
  const h = findHeading(tree, heading);
  if (!h) return { updated: false, message: 'heading not found' };
  const found = findItem(h.children, itemText);
  if (!found) return { updated: false, message: 'item not found' };
  if (opts.newText) found.node.text = opts.newText;
  if (opts.checked !== undefined) found.node.checked = opts.checked;
  return writeTree(filePath, tree);
}

function removeTaskMatch(filePath, heading, match) {
  const tree = loadTree(filePath);
  const h = findHeading(tree, heading);
  if (!h) return { updated: false, message: 'heading not found' };
  const matcher = typeof match === 'string' ? t => t.includes(match) : t => match.test(t);
  const remove = nodes => {
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      if (n.type === 'item' && matcher(n.text)) {
        nodes.splice(i, 1);
        continue;
      }
      if (n.children) remove(n.children);
      if (n.type === 'list' && (!n.children || n.children.length === 0)) {
        nodes.splice(i, 1);
      }
    }
  };
  remove(h.children);
  return writeTree(filePath, tree);
}

function addSubTask(filePath, heading, parentText, subTaskText, checked = false) {
  return insertTask(filePath, heading, subTaskText, { parent: parentText, checked });
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

function translateChecklistItems(filePath, map) {
  const tree = loadTree(filePath);
  const skipped = /\w+\.[A-Za-z0-9]+|\//;

  const untranslated = new Set();

  const hasItem = (nodes, text) => {
    for (const node of nodes) {
      if (node.type === 'item' && node.text === text) return true;
      if (node.children && hasItem(node.children, text)) return true;
    }
    return false;
  };

  const walk = nodes => {
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.type === 'item' && n.text && !skipped.test(n.text)) {
        if (map[n.text]) {
          const target = map[n.text];
          if (hasItem(tree, target)) {
            nodes.splice(i, 1);
            i--;
            continue;
          }
          n.text = target;
        } else {
          untranslated.add(n.text);
        }
      }
      if (n.children) walk(n.children);
    }
  };

  walk(tree);

  if (untranslated.size) {
    const h = getOrCreateHeading(tree, 'Untranslated');
    h.children = h.children || [];
    untranslated.forEach(text => {
      if (!h.children.some(c => c.type === 'item' && c.text === text)) {
        h.children.push({ type: 'item', level: 0, text, checked: false });
      }
    });
  }

  const cleaned = dedupeTree(tree);
  return writeTree(filePath, cleaned);
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
  insertTask,
  updateChecklistItem,
  removeTaskMatch,
  addSubTask,
  addSection,
  addSectionPath,
  removeSection,
  translateContent,
  translateChecklistItems,
  cleanDuplicates
};
