/**
 * Utilities for merging Markdown content.
 */

/**
 * @typedef {Object} MarkdownNode
 * @property {"heading"|"list"|"item"} type
 * @property {number} [level]  // heading level or list nesting level
 * @property {string} text
 * @property {boolean} [checked]
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
    }
  }

  return root.children;
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
function mergeMarkdownTrees(base, update) {
  const result = base.slice();

  for (const node of update) {
    const match = findMatch(result, node);
    if (match) {
      if (node.type === 'item') {
        match.checked = match.checked || node.checked;
      }
      if (node.children && node.children.length) {
        match.children = mergeMarkdownTrees(match.children || [], node.children);
      }
    } else {
      result.push(node);
    }
  }
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
