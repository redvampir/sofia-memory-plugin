const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.join(__dirname, '..');
const TEMPLATE_PATH = path.join(ROOT, 'openapi_template.yaml');
const OUTPUT_PATH = path.join(ROOT, 'openapi.yaml');

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

function main() {
  ensureTemplate();
  const text = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
  validateYaml(text);
  fs.writeFileSync(OUTPUT_PATH, text);
  console.log('OpenAPI updated successfully');
}

main();
