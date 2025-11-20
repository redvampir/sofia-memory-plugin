const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.join(__dirname, '..');
const TEMPLATE_PATH = path.join(ROOT, 'openapi_template.yaml');
const OUTPUT_PATH = path.join(ROOT, 'openapi.yaml');
const BASE_URL_TOKEN = '{{PUBLIC_BASE_URL}}';
const BASE_URL_PLACEHOLDER = new RegExp(BASE_URL_TOKEN, 'g');
const DEFAULT_BASE_URL = 'http://localhost:10000';

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
  if (!envValue) {
    if (options.required) {
      console.error('PUBLIC_BASE_URL не задан — остановка сборки OpenAPI.');
      process.exit(1);
    }
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
