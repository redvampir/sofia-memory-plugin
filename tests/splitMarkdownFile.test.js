const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { splitMarkdownFile } = require('../utils/markdown_utils');

const tmpDir = path.join(__dirname, 'tmp_split_md');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

(async function run(){
  const src = path.join(tmpDir, 'lesson.md');
  const content = [
    '# Lesson',
    '',
    '## Intro',
    'one',
    'two',
    'three',
    '',
    '## Part',
    '### A',
    'a1',
    'a2',
    '',
    '### B',
    'b1',
    'b2'
  ].join('\n');
  fs.writeFileSync(src, content, 'utf-8');

  await splitMarkdownFile(src, { maxLines: 4, splitBy: '##', outputDir: tmpDir });

  const part1 = path.join(tmpDir, 'lesson_part_1.md');
  const part2 = path.join(tmpDir, 'lesson_part_2.md');
  const idxPath = path.join(tmpDir, 'index_split_lesson.json');

  assert.ok(fs.existsSync(part1), 'part1 created');
  assert.ok(fs.existsSync(part2), 'part2 created');
  assert.ok(fs.existsSync(idxPath), 'index created');
  const idx = JSON.parse(fs.readFileSync(idxPath, 'utf-8'));
  assert.strictEqual(idx.parts.length, 2, 'index lists two parts');

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('splitMarkdownFile tests passed');
})();

