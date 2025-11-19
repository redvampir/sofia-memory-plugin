/**
 * Утилиты для разбора, слияния и сериализации Markdown.
 * Полностью совместимо с версиями на TypeScript, но исполняется в Node.js без сборки.
 */

/**
 * @typedef {'heading' | 'list' | 'item' | 'paragraph'} MarkdownNodeType
 * @typedef {Object} MarkdownNode
 * @property {MarkdownNodeType} type
 * @property {number} [level]
 * @property {string} text
 * @property {boolean} [checked]
 * @property {number} [pos]
 * @property {MarkdownNode[]} [children]
 */

/**
 * @typedef {Object} RootNode
 * @property {'root'} type
 * @property {''} text
 * @property {0} level
 * @property {MarkdownNode[]} children
 */

/**
 * Разбор Markdown в дерево узлов.
 * Поддерживает заголовки (h1-h6), вложенные списки и чекбоксы.
 * @param {string} content
 * @returns {MarkdownNode[]}
 */
function parseMarkdownStructure(content) {
  /** @type {RootNode} */
  const root = { type: 'root', level: 0, text: '', children: [] };
  /** @type {(MarkdownNode | RootNode)[]} */
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
      const parentChildren = parent.children ?? (parent.children = []);
      parentChildren.push(node);
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
        const parentChildren = parent.children ?? (parent.children = []);
        parentChildren.push(listNode);
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
      const parentChildren = parent.children ?? (parent.children = []);
      parentChildren.push(itemNode);
      stack.push(itemNode);
      continue;
    }

    if (line.trim() !== '') {
      const para = { type: 'paragraph', level: 0, text: line.trim(), children: [] };
      const parent = stack[stack.length - 1];
      const parentChildren = parent.children ?? (parent.children = []);
      parentChildren.push(para);
    }
  }

  assignPositions(root.children);
  return root.children;
}

/**
 * @param {MarkdownNode[]} nodes
 * @returns {void}
 */
function assignPositions(nodes) {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    node.pos = i;
    if (node.children) assignPositions(node.children);
  }
}

/**
 * @param {MarkdownNode[]} list
 * @param {MarkdownNode} node
 * @returns {MarkdownNode | undefined}
 */
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
 * Глубокое слияние двух деревьев MarkdownNode.
 * @param {MarkdownNode[]} base
 * @param {MarkdownNode[]} update
 * @param {{ replace?: boolean; dedupe?: boolean }} [opts]
 * @returns {MarkdownNode[]}
 */
function mergeMarkdownTrees(base, update, opts = {}) {
  const { replace = false, dedupe = false } = opts;
  const result = base.map(cloneNode);

  for (const node of update) {
    let match = findMatch(result, node);
    if (
      !match &&
      typeof node.pos === 'number' &&
      result[node.pos] &&
      result[node.pos].type === node.type
    ) {
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

/**
 * @param {MarkdownNode} node
 * @returns {MarkdownNode}
 */
function cloneNode(node) {
  const copy = { ...node };
  if (node.children) copy.children = node.children.map(cloneNode);
  return copy;
}

/**
 * @param {MarkdownNode[]} nodes
 * @returns {MarkdownNode[]}
 */
function dedupeTree(nodes) {
  const seenHeadings = new Map();
  const seenItems = new Map();
  const result = [];
  for (const node of nodes) {
    if (node.type === 'heading') {
      const key = `${node.level ?? 0}:${node.text}`;
      if (seenHeadings.has(key)) {
        const existing = seenHeadings.get(key);
        if (!existing) continue;
        existing.children = mergeMarkdownTrees(existing.children || [], node.children || [], { replace: true });
        continue;
      }
      seenHeadings.set(key, node);
    }
    if (node.type === 'item') {
      const key = node.text.toLowerCase();
      if (seenItems.has(key)) {
        const existing = seenItems.get(key);
        if (!existing) continue;
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
 * Сериализация дерева MarkdownNode в Markdown.
 * @param {MarkdownNode[]} tree
 * @returns {string}
 */
function serializeMarkdownTree(tree) {
  const lines = [];
  const walk = (nodes) => {
    for (const node of nodes) {
      if (node.type === 'heading') {
        const level = node.level ?? 0;
        lines.push(`${'#'.repeat(level)} ${node.text}`);
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
