/**
 * Utilities for merging Markdown content.
 */

/**
 * @typedef {Object} MarkdownNode
 * @property {"heading"|"list"|"item"} type
 * @property {number} [level]  // heading level or list nesting level
 * @property {string} text
 * @property {boolean} [checked]
 * @property {number} [pos]     // position index within parent
 * @property {MarkdownNode[]} [children]
 */

/**
 * Parse raw Markdown into a tree of semantic nodes.
 * Supports headings (h1-h6), nested lists and checkboxes.
 * @param {string} content
 * @returns {MarkdownNode[]}
 */
function parseMarkdownStructure(content) {
  const root = { type: 'root', level: 0, text: '', children: [] };
  const stack = [root];
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2].trim();
      const node = { type: 'heading', level, text, children: [] };
      while (
        stack.length > 1 &&
        (stack[stack.length - 1].type !== 'heading' ||
          (stack[stack.length - 1].level || 0) >= level)
      ) {
        stack.pop();
      }
      const parent = stack[stack.length - 1];
      parent.children.push(node);
      stack.push(node);
      continue;
    }

    const list = line.match(/^(\s*)[-*+]\s+(.*)$/);
    if (list) {
      const indent = Math.floor(list[1].replace(/\t/g, '    ').length / 2);
      let text = list[2];
      let checked;
      const chk = text.match(/^\[([ xX])\]\s*(.*)$/);
      if (chk) {
        checked = chk[1].toLowerCase() === 'x';
        text = chk[2];
      }
      while (
        stack.length > 1 &&
        stack[stack.length - 1].type !== 'heading' &&
        (stack[stack.length - 1].level || 0) >= indent
      ) {
        stack.pop();
      }
      let parent = stack[stack.length - 1];
      if (parent.type !== 'list' || parent.level !== indent) {
        const listNode = { type: 'list', level: indent, text: '', children: [] };
        parent.children.push(listNode);
        stack.push(listNode);
        parent = listNode;
      }
      const itemNode = {
        type: 'item',
        level: indent,
        text: text.trim(),
        checked,
        children: []
      };
      parent.children.push(itemNode);
      stack.push(itemNode);
      continue;
    }

    if (line.trim() !== '') {
      const para = { type: 'paragraph', level: 0, text: line.trim(), children: [] };
      const parent = stack[stack.length - 1];
      parent.children.push(para);
    }
  }

  assignPositions(root.children);
  return root.children;
}

function assignPositions(nodes) {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    node.pos = i;
    if (node.children) assignPositions(node.children);
  }
}

function findMatch(list, node) {
  if (node.type === 'heading') {
    return list.find(
      (n) => n.type === 'heading' && n.level === node.level && n.text === node.text
    );
  }
  if (node.type === 'item') {
    return list.find((n) => n.type === 'item' && n.text === node.text);
  }
  if (node.type === 'list') {
    return list.find((n) => n.type === 'list' && n.level === node.level);
  }
  return undefined;
}

/**
 * Deeply merge two MarkdownNode trees.
 * Existing content is preserved; new items are appended when missing.
 * Checklist items prefer checked versions if duplicates appear.
 * @param {MarkdownNode[]} base
 * @param {MarkdownNode[]} update
 * @returns {MarkdownNode[]}
 */
function mergeMarkdownTrees(base, update, opts = {}) {
  const { replace = false, dedupe = false } = opts;
  const result = base.map(cloneNode);

  for (const node of update) {
    let match = findMatch(result, node);
    if (!match && typeof node.pos === 'number' && result[node.pos] && result[node.pos].type === node.type) {
      match = result[node.pos];
    }

    if (match) {
      const idx = result.indexOf(match);
      if (replace) {
        result[idx] = cloneNode(node);
      } else {
        if (node.text && match.text !== node.text) match.text = node.text;
        if (node.type === 'item') {
          match.checked = match.checked || node.checked;
        }
        if (node.children && node.children.length) {
          match.children = mergeMarkdownTrees(match.children || [], node.children, opts);
        }
      }
    } else {
      if (typeof node.pos === 'number' && node.pos <= result.length) {
        result.splice(node.pos, 0, cloneNode(node));
      } else {
        result.push(cloneNode(node));
      }
    }
  }

  assignPositions(result);
  return dedupe ? dedupeTree(result) : result;
}

function cloneNode(node) {
  const copy = { ...node };
  if (node.children) copy.children = node.children.map(cloneNode);
  return copy;
}

function dedupeTree(nodes) {
  const seenHeadings = new Map();
  const seenItems = new Map();
  const result = [];
  for (const node of nodes) {
    if (node.type === 'heading') {
      const key = `${node.level}:${node.text}`;
      if (seenHeadings.has(key)) {
        const existing = seenHeadings.get(key);
        existing.children = mergeMarkdownTrees(existing.children || [], node.children || [], { replace: true });
        continue;
      }
      seenHeadings.set(key, node);
    }
    if (node.type === 'item') {
      const key = node.text.toLowerCase();
      if (seenItems.has(key)) {
        const existing = seenItems.get(key);
        if (node.checked) existing.checked = true;
        continue;
      }
      seenItems.set(key, node);
    }
    if (node.children) node.children = dedupeTree(node.children);
    result.push(node);
  }
  assignPositions(result);
  return result;
}

/**
 * Serialize a MarkdownNode tree back to raw Markdown.
 * @param {MarkdownNode[]} tree
 * @returns {string}
 */
function serializeMarkdownTree(tree) {
  const lines = [];
  const walk = (nodes) => {
    for (const node of nodes) {
      if (node.type === 'heading') {
        lines.push(`${'#'.repeat(node.level)} ${node.text}`);
        if (node.children) walk(node.children);
      } else if (node.type === 'item') {
        const indent = '  '.repeat(node.level || 0);
        let line = `${indent}- `;
        if (typeof node.checked === 'boolean') {
          line += `[${node.checked ? 'x' : ' '}] `;
        }
        line += node.text;
        lines.push(line);
        if (node.children) walk(node.children);
      } else if (node.type === 'list') {
        if (node.children) walk(node.children);
      } else if (node.type === 'paragraph') {
        lines.push(node.text);
      }
    }
  };
  walk(tree);
  return lines.join('\n');
}

module.exports = {
  parseMarkdownStructure,
  mergeMarkdownTrees,
  serializeMarkdownTree,
};
