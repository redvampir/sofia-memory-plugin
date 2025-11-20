const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.join(__dirname, '..');
const TEMPLATE_PATH = path.join(ROOT, 'openapi_template.yaml');
const OUTPUT_PATH = path.join(ROOT, 'openapi.yaml');
const BASE_URL_TOKEN = '{{PUBLIC_BASE_URL}}';
const BASE_URL_PLACEHOLDER = new RegExp(BASE_URL_TOKEN, 'g');
const DEFAULT_BASE_URL = 'http://localhost:10000';

function isProductionEnv(env = process.env) {
  const nodeEnv = (env.NODE_ENV || '').toLowerCase();
  const renderFlag = (env.RENDER || '').toLowerCase();
  return nodeEnv === 'production' || renderFlag === 'true';
}

function ensureTemplate() {
  if (!fs.existsSync(TEMPLATE_PATH)) {
    if (fs.existsSync(OUTPUT_PATH)) {
      fs.copyFileSync(OUTPUT_PATH, TEMPLATE_PATH);
      console.log('Created openapi_template.yaml from existing openapi.yaml');
    } else {
      console.warn('openapi_template.yaml not found and openapi.yaml missing');
      process.exit(1);
    }
  }
}

function validateYaml(text) {
  try {
    yaml.load(text);
  } catch (e) {
    console.error('Invalid YAML in template:', e.message);
    process.exit(1);
  }
}

function normalizeBaseUrl(baseUrl) {
  return baseUrl.replace(/\/+$/, '');
}

function resolveBaseUrl(options = {}) {
  const envValue = (process.env.PUBLIC_BASE_URL || '').trim();
  const production = options.required ?? isProductionEnv();

  if (!envValue) {
    if (production) {
      console.error(
        'PUBLIC_BASE_URL обязателен в продакшене (NODE_ENV=production или RENDER=true) — остановка генерации OpenAPI.'
      );
      process.exit(1);
    }

    console.log(
      `PUBLIC_BASE_URL не задан, dev-режим: используется локальный адрес ${DEFAULT_BASE_URL}`
    );
    return DEFAULT_BASE_URL;
  }

  try {
    const parsed = new URL(envValue);
    return normalizeBaseUrl(parsed.toString());
  } catch (error) {
    console.error('PUBLIC_BASE_URL содержит неверный URL:', error.message);
    process.exit(1);
  }
}

function applyBaseUrl(text, baseUrl) {
  if (!text.includes(BASE_URL_TOKEN)) {
    return text;
  }

  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const resolved = text.replace(BASE_URL_PLACEHOLDER, normalizedBaseUrl);
  console.log(`Подставлен базовый URL для OpenAPI: ${normalizedBaseUrl}`);
  return resolved;
}

function buildOpenapi(baseUrl) {
  ensureTemplate();
  const text = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
  const updated = applyBaseUrl(text, baseUrl);
  validateYaml(updated);
  fs.writeFileSync(OUTPUT_PATH, updated);
  console.log('OpenAPI updated successfully');
}

function main() {
  const baseUrl = resolveBaseUrl();
  buildOpenapi(baseUrl);
}

if (require.main === module) {
  main();
}

module.exports = { buildOpenapi, resolveBaseUrl };
