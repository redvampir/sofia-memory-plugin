#!/usr/bin/env node

/**
 * Pre-deploy validation script
 *
 * Проверяет готовность проекта к деплою на production:
 * - Переменные окружения
 * - Зависимости npm
 * - Тесты
 * - OpenAPI спецификация
 * - Конфигурация
 *
 * Использование:
 *   node scripts/pre_deploy_check.js
 *   npm run pre-deploy
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REQUIRED_ENV_VARS = [
  'TOKEN_SECRET',
  'PORT',
];

const OPTIONAL_ENV_VARS = [
  'NODE_ENV',
  'MEMORY_MODE',
  'GITHUB_REPO',
  'PUBLIC_BASE_URL',
  'DEBUG_ADMIN_TOKEN',
];

let hasErrors = false;
let hasWarnings = false;

function log(message, type = 'info') {
  const symbols = {
    info: 'ℹ️',
    success: '✅',
    warning: '⚠️',
    error: '❌',
  };
  console.log(`${symbols[type]} ${message}`);
}

function section(title) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('='.repeat(60));
}

// 1. Check Node.js version
section('Checking Node.js version');
try {
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.split('.')[0].substring(1));

  if (majorVersion >= 18) {
    log(`Node.js ${nodeVersion} ✓`, 'success');
  } else {
    log(`Node.js ${nodeVersion} - требуется >= 18.x`, 'error');
    hasErrors = true;
  }
} catch (e) {
  log('Не удалось проверить версию Node.js', 'error');
  hasErrors = true;
}

// 2. Check environment variables
section('Checking environment variables');

// Load .env if exists
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
  log('.env файл найден', 'info');
} else {
  log('.env файл не найден (ОК для production)', 'warning');
}

// Check required variables
REQUIRED_ENV_VARS.forEach(varName => {
  if (process.env[varName]) {
    const value = varName === 'TOKEN_SECRET'
      ? '***'
      : process.env[varName];
    log(`${varName}=${value}`, 'success');
  } else {
    log(`${varName} не задана`, 'error');
    hasErrors = true;
  }
});

// Check optional variables
log('\nОпциональные переменные:', 'info');
OPTIONAL_ENV_VARS.forEach(varName => {
  if (process.env[varName]) {
    log(`${varName}=${process.env[varName]}`, 'success');
  } else {
    log(`${varName} не задана (используется значение по умолчанию)`, 'warning');
  }
});

// 3. Check package.json and dependencies
section('Checking package.json');
try {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8')
  );

  log(`Название: ${packageJson.name}`, 'info');
  log(`Версия: ${packageJson.version}`, 'info');

  if (!packageJson.scripts.start) {
    log('Отсутствует npm start скрипт', 'error');
    hasErrors = true;
  } else {
    log(`Start script: ${packageJson.scripts.start}`, 'success');
  }

  // Check critical dependencies
  const criticalDeps = ['express', 'dotenv', 'body-parser'];
  criticalDeps.forEach(dep => {
    if (packageJson.dependencies[dep]) {
      log(`${dep}: ${packageJson.dependencies[dep]}`, 'success');
    } else {
      log(`Отсутствует зависимость: ${dep}`, 'error');
      hasErrors = true;
    }
  });
} catch (e) {
  log('Ошибка чтения package.json: ' + e.message, 'error');
  hasErrors = true;
}

// 4. Check npm vulnerabilities
section('Checking npm vulnerabilities');
try {
  execSync('npm audit --audit-level=high --json', {
    stdio: 'pipe',
    encoding: 'utf-8'
  });
  log('Критических уязвимостей не найдено', 'success');
} catch (e) {
  try {
    const auditOutput = JSON.parse(e.stdout);
    const { high, critical } = auditOutput.metadata.vulnerabilities;

    if (high > 0 || critical > 0) {
      log(`Найдено уязвимостей: high=${high}, critical=${critical}`, 'warning');
      log('Запустите: npm audit fix', 'warning');
      hasWarnings = true;
    }
  } catch {
    log('Не удалось проверить уязвимости', 'warning');
    hasWarnings = true;
  }
}

// 5. Check if node_modules exists
section('Checking dependencies installation');
if (fs.existsSync(path.join(__dirname, '..', 'node_modules'))) {
  log('node_modules установлены', 'success');
} else {
  log('node_modules не найдены. Запустите: npm install', 'error');
  hasErrors = true;
}

// 6. Run tests
section('Running tests');
try {
  const testOutput = execSync('npm test', {
    stdio: 'pipe',
    encoding: 'utf-8',
    env: { ...process.env, TOKEN_SECRET: process.env.TOKEN_SECRET || 'test-secret' }
  });

  if (testOutput.includes('passed') || testOutput.includes('✓')) {
    log('Все тесты прошли успешно', 'success');
  } else {
    log('Статус тестов неизвестен', 'warning');
    hasWarnings = true;
  }
} catch (e) {
  log('Тесты завершились с ошибкой', 'error');
  log(e.message, 'error');
  hasErrors = true;
}

// 7. Check OpenAPI specification
section('Checking OpenAPI specification');
const openapiPath = path.join(__dirname, '..', 'openapi.yaml');
if (fs.existsSync(openapiPath)) {
  try {
    const openapiContent = fs.readFileSync(openapiPath, 'utf-8');

    // Check if PUBLIC_BASE_URL is properly set
    if (openapiContent.includes('localhost')) {
      log('OpenAPI содержит localhost - не забудьте обновить для production', 'warning');
      hasWarnings = true;
    } else {
      log('OpenAPI спецификация корректна', 'success');
    }
  } catch (e) {
    log('Ошибка чтения openapi.yaml: ' + e.message, 'error');
    hasErrors = true;
  }
} else {
  log('openapi.yaml не найден', 'warning');
  hasWarnings = true;
}

// 8. Check critical files
section('Checking critical files');
const criticalFiles = [
  'index.js',
  'package.json',
  'package-lock.json',
  '.gitignore',
];

criticalFiles.forEach(file => {
  if (fs.existsSync(path.join(__dirname, '..', file))) {
    log(`${file} ✓`, 'success');
  } else {
    log(`${file} не найден`, 'error');
    hasErrors = true;
  }
});

// 9. Check .env.example exists
section('Checking documentation');
if (fs.existsSync(path.join(__dirname, '..', '.env.example'))) {
  log('.env.example существует', 'success');
} else {
  log('.env.example не найден - рекомендуется создать', 'warning');
  hasWarnings = true;
}

// 10. Summary
section('Summary');

if (hasErrors) {
  log('❌ ПРОВЕРКА НЕ ПРОЙДЕНА - найдены критические ошибки', 'error');
  log('Исправьте ошибки перед деплоем', 'error');
  process.exit(1);
} else if (hasWarnings) {
  log('⚠️  ПРОВЕРКА ПРОЙДЕНА С ПРЕДУПРЕЖДЕНИЯМИ', 'warning');
  log('Рекомендуется исправить предупреждения', 'warning');
  process.exit(0);
} else {
  log('✅ ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ УСПЕШНО', 'success');
  log('Проект готов к деплою!', 'success');
  process.exit(0);
}
