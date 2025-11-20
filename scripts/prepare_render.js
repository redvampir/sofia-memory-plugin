const fs = require('fs');
const path = require('path');

const { buildOpenapi, resolveBaseUrl } = require('./generate_openapi');

const ROOT = path.join(__dirname, '..');
const PLUGIN_PATH = path.join(ROOT, 'ai-plugin.json');

function updateAiPlugin(baseUrl) {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  const content = fs.readFileSync(PLUGIN_PATH, 'utf-8');
  const data = JSON.parse(content);

  data.api = {
    ...data.api,
    url: `${normalizedBaseUrl}/openapi.yaml`,
  };
  data.logo_url = `${normalizedBaseUrl}/logo.png`;

  fs.writeFileSync(PLUGIN_PATH, `${JSON.stringify(data, null, 2)}\n`);
  console.log('ai-plugin.json обновлён на хост:', normalizedBaseUrl);
}

function main() {
  const baseUrl = resolveBaseUrl({ required: true });
  buildOpenapi(baseUrl);
  updateAiPlugin(baseUrl);
}

main();
