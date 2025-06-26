const fs = require('fs');
const mdEditor = require('./markdown_editor');

function addSection(filePath, heading, lines, opts = {}) {
  return mdEditor.insertSection(filePath, heading, lines, opts.force);
}

function addLabel(filePath, label, opts = {}) {
  const { heading = undefined, level = 1, force = false } = opts;
  let text = label;
  if (/^[-*]/.test(text.trim())) text = '\\' + text;
  try {
    return mdEditor.insertAtAnchor({
      filePath,
      content: text,
      heading,
      level,
      occurrence: 1,
      position: 'after',
      skipIfExists: true,
      force
    });
  } catch (_) {
    if (!fs.existsSync(filePath)) throw _;
    const raw = fs.readFileSync(filePath, 'utf-8');
    if (raw.includes(text)) return false;
    const lines = raw.split(/\r?\n/);
    lines.push('', text);
    fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
    return true;
  }
}

function addFootnote(filePath, id, text, opts = {}) {
  const note = `[^${id}]: ${text}`;
  const r = mdEditor.insertSection(filePath, 'Footnotes', [note], opts.force);
  mdEditor.deduplicateMarkdown({ filePath, heading: 'Footnotes', force: opts.force });
  return r;
}

function addElement(filePath, type, options = {}) {
  switch (type) {
    case 'section':
      return addSection(filePath, options.heading, options.contentLines || [], options);
    case 'label':
      return addLabel(filePath, options.label, options);
    case 'footnote':
      return addFootnote(filePath, options.id, options.text, options);
    default:
      throw new Error('Unsupported element type');
  }
}

module.exports = {
  addSection,
  addLabel,
  addFootnote,
  addElement
};
