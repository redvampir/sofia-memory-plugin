const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { editMarkdownFile, readMarkdownFile } = require('./markdown_safe_edit');
const fileEditor = require('../logic/markdown_file_editor');
const validator = require('../logic/markdown_validator');
const { parseMarkdownStructure, serializeMarkdownTree } = require('../logic/markdown_merge_engine.ts');

function ensure_section_exists(filePath, heading) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/);
  const idx = validator.findHeadingIndex(lines, heading);
  if (idx === -1) {
    throw new Error(`Section '${heading}' not found`);
  }
}

function write_lines(filePath, lines, force = false) {
  const check = validator.validateMarkdownSyntax(lines, filePath);
  if (!check.valid) {
    console.error(`[write_lines] ${check.message} at line ${check.line} in '${path.basename(filePath)}'`);
    if (!force) return false;
  }
  fileEditor.createBackup(filePath);
  const data = Array.isArray(lines) ? lines.join('\n') : lines;
  fs.writeFileSync(filePath, data, 'utf-8');
  return true;
}

function rename_section_dry(filePath, oldHeading, newHeading) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split(/\r?\n/);
  validator.validateMarkdownSyntax(lines, filePath);
  const idx = validator.findHeadingIndex(lines, oldHeading);
  if (idx === -1) throw new Error(`Section '${oldHeading}' not found`);
  const level = lines[idx].match(/^(#+)/)[1];
  lines[idx] = `${level} ${newHeading}`;
  return lines.join('\n');
}

async function process_with_sofia(content, instruction) {
  const endpoint = process.env.SOFIA_ENDPOINT;
  if (!endpoint) {
    console.warn('[sofia] endpoint not configured');
    return content;
  }
  try {
    const resp = await axios.post(endpoint, { text: content, instruction });
    return resp.data.text || resp.data;
  } catch (e) {
    console.warn('[sofia] request failed', e.message);
    return content;
  }
}

async function apply_action(filePath, cmd, opts = {}) {
  switch (cmd.action) {
    case 'add_checklist_item':
      ensure_section_exists(filePath, cmd.section);
      return fileEditor.insertTask(filePath, cmd.section, cmd.text.replace(/^[-*]\s+\[[ xX]\]\s+/, ''), { dryRun: true });
    case 'check_item':
      ensure_section_exists(filePath, cmd.section);
      return fileEditor.updateChecklistItem(filePath, cmd.section, cmd.text, { checked: true, dryRun: true });
    case 'remove_item':
      ensure_section_exists(filePath, cmd.section);
      return fileEditor.removeTask(filePath, cmd.section, cmd.text, { dryRun: true });
    case 'rename_section':
      return { updated: true, content: rename_section_dry(filePath, cmd.section, cmd.new) };
    case 'insert_subitem':
      ensure_section_exists(filePath, cmd.section);
      return fileEditor.insertTask(filePath, cmd.section, cmd.text, { parent: cmd.parent, dryRun: true });
    default:
      return null;
  }
}

async function safe_markdown_edit(filePath, command, opts = {}) {
  const autoConfirm = opts.autoConfirm ?? false;
  const dryRun = opts.dryRun ?? false;
  let cmdObj = null;
  if (typeof command === 'object') cmdObj = command;
  else {
    try { cmdObj = JSON.parse(command); } catch {}
  }
  let newContent;
  if (cmdObj && cmdObj.action) {
    const result = await apply_action(filePath, cmdObj, { dryRun: true });
    if (!result || result.updated === false) throw new Error(result && result.message ? result.message : 'update failed');
    newContent = result.content;
  } else {
    const original = readMarkdownFile(filePath);
    newContent = await process_with_sofia(original, command);
  }
  if (newContent === undefined || newContent === null) return false;
  if (dryRun) return { updated: true, content: newContent };
  await editMarkdownFile(filePath, () => newContent, { autoConfirm });
  return true;
}

module.exports = { safe_markdown_edit };
