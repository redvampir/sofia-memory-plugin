#!/usr/bin/env node

/**
 * Скрипт автоматической миграции naming convention
 * Конвертирует snake_case в camelCase для функций и переменных
 *
 * Использование:
 *   node scripts/migrate_naming.js --analyze          # Только анализ, без изменений
 *   node scripts/migrate_naming.js --migrate <file>   # Мигрировать конкретный файл
 *   node scripts/migrate_naming.js --migrate-all      # Мигрировать все файлы
 */

const fs = require('fs');
const path = require('path');

// Карта замен snake_case -> camelCase
const NAMING_MAP = {
  // Функции
  'log_restore_action': 'logRestoreAction',
  'get_context_for_user': 'getContextForUser',
  'start_context_checker': 'startContextChecker',
  'auto_recover_context': 'autoRecoverContext',
  'allow_cors': 'allowCors',

  // Переменные и импорты
  'memory_routes': 'memoryRoutes',
  'github_routes': 'githubRoutes',
  'mode_routes': 'modeRoutes',
  'token_store': 'tokenStore',
  'index_manager': 'indexManager',
  'memory_config': 'memoryConfig',
  'user_id': 'userId',

  // Параметры функций
  'dir_path': 'dirPath',

  // Прочие
  'log_debug': 'logDebug',
  'log_error': 'logError',
};

// Исключения - не менять эти идентификаторы
const EXCEPTIONS = new Set([
  'TOKEN_SECRET',        // Переменная окружения
  'DEBUG_ADMIN_TOKEN',   // Переменная окружения
  'NODE_ENV',           // Переменная окружения
  'PUBLIC_BASE_URL',    // Переменная окружения
  'MEMORY_MODE',        // Переменная окружения
  'GITHUB_REPO',        // Переменная окружения
  'MAX_FILE_SIZE',      // Константа
  'access_control',     // Название модуля
  'memory_mode',        // Название модуля
  'error_handler',      // Название модуля
]);

/**
 * Конвертирует snake_case в camelCase
 * @param {string} str
 * @returns {string}
 */
function snakeToCamel(str) {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Проверяет, является ли идентификатор snake_case
 * @param {string} identifier
 * @returns {boolean}
 */
function isSnakeCase(identifier) {
  return /^[a-z]+(_[a-z]+)+$/.test(identifier) && !EXCEPTIONS.has(identifier);
}

/**
 * Проверяет, является ли идентификатор UPPER_SNAKE_CASE (константа)
 * @param {string} identifier
 * @returns {boolean}
 */
function isConstantCase(identifier) {
  return /^[A-Z]+(_[A-Z]+)*$/.test(identifier);
}

/**
 * Анализирует файл и находит все snake_case идентификаторы
 * @param {string} filePath
 * @returns {Object}
 */
function analyzeFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  const findings = {
    functions: new Set(),
    variables: new Set(),
    parameters: new Set(),
    imports: new Set(),
  };

  lines.forEach((line, index) => {
    // Функции: function foo_bar()
    const funcMatch = line.match(/function\s+([a-z_]+)\s*\(/);
    if (funcMatch && isSnakeCase(funcMatch[1])) {
      findings.functions.add(funcMatch[1]);
    }

    // Стрелочные функции: const foo_bar = (...) =>
    const arrowMatch = line.match(/const\s+([a-z_]+)\s*=\s*\([^)]*\)\s*=>/);
    if (arrowMatch && isSnakeCase(arrowMatch[1])) {
      findings.functions.add(arrowMatch[1]);
    }

    // Переменные: const/let/var foo_bar
    const varMatch = line.match(/(?:const|let|var)\s+([a-z_]+)\s*=/);
    if (varMatch && isSnakeCase(varMatch[1])) {
      findings.variables.add(varMatch[1]);
    }

    // Деструктуризация: const { foo_bar } = require(...)
    const destructMatch = line.match(/\{\s*([a-z_,\s]+)\s*\}/);
    if (destructMatch) {
      destructMatch[1].split(',').forEach(name => {
        const trimmed = name.trim();
        if (isSnakeCase(trimmed)) {
          findings.variables.add(trimmed);
        }
      });
    }

    // Параметры функций
    const paramMatch = line.match(/\(([^)]+)\)/);
    if (paramMatch) {
      paramMatch[1].split(',').forEach(param => {
        const name = param.trim().split('=')[0].trim();
        if (isSnakeCase(name)) {
          findings.parameters.add(name);
        }
      });
    }
  });

  return findings;
}

/**
 * Применяет миграцию к файлу
 * @param {string} filePath
 * @param {boolean} dryRun
 * @returns {Object}
 */
function migrateFile(filePath, dryRun = false) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let replacements = 0;
  const changes = [];

  // Применяем замены из NAMING_MAP
  Object.entries(NAMING_MAP).forEach(([oldName, newName]) => {
    // Ищем все вхождения с boundary checking
    const regex = new RegExp(`\\b${oldName}\\b`, 'g');
    const matches = content.match(regex);

    if (matches) {
      content = content.replace(regex, newName);
      replacements += matches.length;
      changes.push({ oldName, newName, count: matches.length });
    }
  });

  if (!dryRun && replacements > 0) {
    fs.writeFileSync(filePath, content, 'utf-8');
  }

  return { replacements, changes };
}

/**
 * Рекурсивно находит все .js файлы в директории
 * @param {string} dir
 * @param {Array<string>} excludeDirs
 * @returns {Array<string>}
 */
function findJsFiles(dir, excludeDirs = ['node_modules', '.git', 'tests', 'memory']) {
  let results = [];

  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      if (!excludeDirs.includes(file)) {
        results = results.concat(findJsFiles(filePath, excludeDirs));
      }
    } else if (file.endsWith('.js')) {
      results.push(filePath);
    }
  });

  return results;
}

// CLI
const args = process.argv.slice(2);
const command = args[0];
const target = args[1];

const rootDir = path.join(__dirname, '..');

switch (command) {
  case '--analyze': {
    console.log('🔍 Анализ кодовой базы на наличие snake_case...\n');

    const files = findJsFiles(rootDir);
    let totalFindings = 0;

    files.forEach(file => {
      const findings = analyzeFile(file);
      const allFindings = [
        ...findings.functions,
        ...findings.variables,
        ...findings.parameters,
      ];

      if (allFindings.length > 0) {
        console.log(`📄 ${path.relative(rootDir, file)}`);
        console.log(`   Функции: ${[...findings.functions].join(', ') || 'нет'}`);
        console.log(`   Переменные: ${[...findings.variables].join(', ') || 'нет'}`);
        console.log(`   Параметры: ${[...findings.parameters].join(', ') || 'нет'}`);
        console.log('');
        totalFindings += allFindings.length;
      }
    });

    console.log(`\n✅ Найдено ${totalFindings} идентификаторов в snake_case`);
    console.log(`📋 Проверено файлов: ${files.length}`);
    break;
  }

  case '--migrate': {
    if (!target) {
      console.error('❌ Укажите путь к файлу: --migrate <file>');
      process.exit(1);
    }

    const filePath = path.resolve(target);

    if (!fs.existsSync(filePath)) {
      console.error(`❌ Файл не найден: ${filePath}`);
      process.exit(1);
    }

    console.log(`🔄 Миграция файла: ${path.relative(rootDir, filePath)}\n`);

    const result = migrateFile(filePath, false);

    if (result.replacements > 0) {
      console.log(`✅ Выполнено ${result.replacements} замен:`);
      result.changes.forEach(({ oldName, newName, count }) => {
        console.log(`   ${oldName} → ${newName} (${count}x)`);
      });
    } else {
      console.log('ℹ️  Изменений не требуется');
    }
    break;
  }

  case '--migrate-all': {
    console.log('🚀 Миграция всех файлов...\n');

    const files = findJsFiles(rootDir);
    let totalReplacements = 0;
    let migratedFiles = 0;

    files.forEach(file => {
      const result = migrateFile(file, false);

      if (result.replacements > 0) {
        console.log(`✅ ${path.relative(rootDir, file)} - ${result.replacements} замен`);
        totalReplacements += result.replacements;
        migratedFiles++;
      }
    });

    console.log(`\n🎉 Миграция завершена!`);
    console.log(`   Обработано файлов: ${migratedFiles}`);
    console.log(`   Всего замен: ${totalReplacements}`);
    break;
  }

  default:
    console.log(`
📝 Скрипт миграции naming convention

Использование:
  node scripts/migrate_naming.js --analyze          # Анализ без изменений
  node scripts/migrate_naming.js --migrate <file>   # Мигрировать файл
  node scripts/migrate_naming.js --migrate-all      # Мигрировать все

Примеры:
  node scripts/migrate_naming.js --analyze
  node scripts/migrate_naming.js --migrate index.js
  node scripts/migrate_naming.js --migrate-all
    `);
}
