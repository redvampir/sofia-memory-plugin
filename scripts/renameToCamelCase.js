#!/usr/bin/env node

/**
 * Утилита для поиска и переименования snake_case идентификаторов в camelCase.
 *
 * Возможности:
 *  - формирование отчёта (--report docs/naming_scan.md)
 *  - массовая замена по готовой карте (--mapping mapping.json --apply)
 *  - безопасный dry-run по умолчанию
 *  - список исключений (встроенный и пользовательский файл через --exclude)
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_DIRECTORIES = ['src', 'api', 'tools', 'logic', 'memory'];
const DEFAULT_EXTENSIONS = new Set(['.js', '.ts', '.cjs', '.mjs']);
const BUILTIN_EXCLUSIONS = new Set([
  'TOKEN_SECRET',
  'DEBUG_ADMIN_TOKEN',
  'NODE_ENV',
  'PUBLIC_BASE_URL',
  'MEMORY_MODE',
  'GITHUB_REPO',
  'GITHUB_TOKEN',
  'MODE',
  'PORT',
  'LOCAL_MEMORY_PATH',
  'GITHUB_API_URL',
  'MAX_FILE_SIZE',
  'MEMORY_METADATA_TTL_MS',
]);

function parseArgs(argv) {
  const args = argv.slice(2);
  const options = {
    reportPath: null,
    apply: false,
    mappingPath: null,
    excludePath: null,
    limit: 200,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    switch (arg) {
      case '--report':
        options.reportPath = args[++i];
        break;
      case '--apply':
        options.apply = true;
        break;
      case '--mapping':
        options.mappingPath = args[++i];
        break;
      case '--exclude':
        options.excludePath = args[++i];
        break;
      case '--limit':
        options.limit = Number.parseInt(args[++i], 10) || options.limit;
        break;
      default:
        break;
    }
  }

  return options;
}

function snakeToCamel(identifier) {
  return identifier.replace(/_([a-z0-9])/g, (_, letter) => letter.toUpperCase());
}

function isSnakeCandidate(identifier) {
  return /^[a-z][a-z0-9_]*_[a-z0-9_]+$/.test(identifier);
}

function isConstantCase(identifier) {
  return /^[A-Z0-9_]+$/.test(identifier);
}

function loadJsonIfExists(filePath, fallback = {}) {
  if (!filePath) return fallback;
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) return fallback;
  const raw = fs.readFileSync(abs, 'utf-8');
  return JSON.parse(raw);
}

function collectExclusions(userExclusionsPath) {
  const exclusions = new Set(BUILTIN_EXCLUSIONS);
  const userList = loadJsonIfExists(userExclusionsPath, []);
  if (Array.isArray(userList)) {
    userList.forEach(item => exclusions.add(item));
  }
  return exclusions;
}

function readTokens(content) {
  return content.match(/\b[a-zA-Z][a-zA-Z0-9_]*\b/g) || [];
}

function scanFile(filePath, exclusions) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const tokens = readTokens(content);
  const matches = new Set();

  tokens.forEach(token => {
    if (exclusions.has(token)) return;
    if (isConstantCase(token)) return;
    if (isSnakeCandidate(token)) {
      matches.add(token);
    }
  });

  return matches;
}

function walkFiles(dir, result = []) {
  if (!fs.existsSync(dir)) return result;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, result);
    } else if (DEFAULT_EXTENSIONS.has(path.extname(entry.name))) {
      result.push(fullPath);
    }
  }
  return result;
}

function createReport(findings, limit) {
  const lines = [];
  lines.push('# Отчёт по snake_case идентификаторам');
  lines.push('');
  lines.push(`Просканировано файлов: ${findings.files}`);
  lines.push(`Найдено уникальных идентификаторов: ${findings.total}`);
  lines.push('');
  lines.push('| Файл | Идентификатор | Предложение |');
  lines.push('| --- | --- | --- |');

  let printed = 0;
  for (const { file, name } of findings.items) {
    if (printed >= limit) break;
    lines.push(`| ${file} | ${name} | ${snakeToCamel(name)} |`);
    printed += 1;
  }

  if (findings.items.length > limit) {
    lines.push('');
    lines.push(`… ещё ${findings.items.length - limit} идентификаторов скрыто (используйте --limit для изменения порога).`);
  }

  return lines.join('\n');
}

function buildFindings(files, exclusions) {
  const items = [];
  const unique = new Set();

  files.forEach(file => {
    const matches = scanFile(file, exclusions);
    matches.forEach(name => {
      unique.add(name);
      items.push({ file: path.relative(process.cwd(), file), name });
    });
  });

  return { items, total: unique.size, files: files.length };
}

function applyMappingToFile(filePath, mapping) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let replacements = 0;

  Object.entries(mapping).forEach(([from, to]) => {
    const regex = new RegExp(`\\b${from}\\b`, 'g');
    const hits = content.match(regex);
    if (hits && hits.length > 0) {
      content = content.replace(regex, to);
      replacements += hits.length;
    }
  });

  if (replacements > 0) {
    fs.writeFileSync(filePath, content, 'utf-8');
  }

  return replacements;
}

function main() {
  const options = parseArgs(process.argv);
  const exclusions = collectExclusions(options.excludePath);
  const mapping = loadJsonIfExists(options.mappingPath, {});

  const files = DEFAULT_DIRECTORIES.flatMap(dir => walkFiles(dir));
  const findings = buildFindings(files, exclusions);

  if (options.reportPath) {
    const report = createReport(findings, options.limit);
    const abs = path.resolve(options.reportPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, report, 'utf-8');
    console.log(`Отчёт сохранён в ${abs}`);
  } else {
    console.log(`Найдено ${findings.total} уникальных snake_case идентификаторов в ${findings.files} файлах.`);
  }

  if (options.apply) {
    if (!mapping || Object.keys(mapping).length === 0) {
      console.warn('⚠️  Для применения замен требуется непустая карта (--mapping).');
      return;
    }

    const stats = files.map(file => applyMappingToFile(file, mapping));
    const totalChanges = stats.reduce((acc, val) => acc + val, 0);
    console.log(`Применено замен: ${totalChanges}`);
  }
}

main();
