const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.join(__dirname, '..');
const TEMPLATE_PATH = path.join(ROOT, 'openapi_template.yaml');
const OUTPUT_PATH = path.join(ROOT, 'openapi.yaml');
const BASE_URL_PLACEHOLDER = /{{PUBLIC_BASE_URL}}/g;

const DEFAULT_BASE_URL = process.env.PUBLIC_BASE_URL || 'http://localhost:10000';

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

function applyBaseUrl(text) {
  if (!BASE_URL_PLACEHOLDER.test(text)) {
    return text;
  }

  const resolved = text.replace(BASE_URL_PLACEHOLDER, DEFAULT_BASE_URL);
  console.log(`Подставлен базовый URL для OpenAPI: ${DEFAULT_BASE_URL}`);
  return resolved;
}

function main() {
  ensureTemplate();
  const text = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
  const updated = applyBaseUrl(text);
  validateYaml(updated);
  fs.writeFileSync(OUTPUT_PATH, updated);
  console.log('OpenAPI updated successfully');
}

main();
