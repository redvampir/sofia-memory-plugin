const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.join(__dirname, '..');
const OPENAPI_PATH = path.join(ROOT, 'api', 'openapi.yaml');
const CONFIG_PATH = path.join(ROOT, 'config', 'openapi-lite.config.json');
const OUTPUT_PATH = path.join(ROOT, 'api', 'openapi_lite.yaml');

function loadYaml(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return yaml.load(raw);
}

function saveYaml(filePath, data) {
  const text = yaml.dump(data, { noRefs: true, lineWidth: -1 });
  fs.writeFileSync(filePath, text, 'utf-8');
}

function gatherOperations(spec) {
  const ops = [];
  const paths = spec.paths || {};
  for (const [p, methods] of Object.entries(paths)) {
    for (const [method, op] of Object.entries(methods)) {
      if (method !== 'get' && method !== 'post') continue;
      const opId = op.operationId || `${method}_${p}`;
      const tag = Array.isArray(op.tags) && op.tags.length ? op.tags[0] : 'default';
      ops.push({ path: p, method, tag, opId, data: op });
    }
  }
  return ops;
}

function selectOperations(allOps, cfg) {
  const selected = [];
  const removed = [];
  const counts = {};
  const preserveSet = new Set(cfg.preserve || []);

  const preserved = allOps.filter(o => preserveSet.has(o.opId));
  preserved.forEach(op => {
    counts[op.tag] = (counts[op.tag] || 0) + 1;
    selected.push(op);
  });

  const rest = allOps.filter(o => !preserveSet.has(o.opId));
  const tagPriority = cfg.priority_tags || [];
  rest.sort((a, b) => {
    const pa = tagPriority.indexOf(a.tag);
    const pb = tagPriority.indexOf(b.tag);
    return (pa === -1 ? Infinity : pa) - (pb === -1 ? Infinity : pb);
  });

  for (const op of rest) {
    if (selected.length >= cfg.max_operations) {
      removed.push(op);
      continue;
    }
    const limit = cfg.group_limits && cfg.group_limits[op.tag];
    const count = counts[op.tag] || 0;
    if (limit !== undefined && count >= limit) {
      removed.push(op);
      continue;
    }
    counts[op.tag] = count + 1;
    selected.push(op);
  }

  return { selected, removed };
}

function collectRefs(obj, refs) {
  if (!obj || typeof obj !== 'object') return;
  for (const [k, v] of Object.entries(obj)) {
    if (k === '$ref' && typeof v === 'string') {
      const m = v.match(/^#\/components\/([^\/]+)\/(.+)$/);
      if (m) refs.add(`${m[1]}:${m[2]}`);
    } else if (typeof v === 'object') {
      collectRefs(v, refs);
    }
  }
}

function buildComponents(fullComponents, refs) {
  const result = {};
  const queue = Array.from(refs);
  const seen = new Set();

  while (queue.length) {
    const ref = queue.pop();
    if (seen.has(ref)) continue;
    seen.add(ref);
    const [type, name] = ref.split(':');
    if (!fullComponents[type] || !fullComponents[type][name]) continue;
    if (!result[type]) result[type] = {};
    const obj = fullComponents[type][name];
    result[type][name] = obj;
    collectRefs(obj, refs);
  }

  return result;
}

function buildLiteSpec(spec, ops) {
  const lite = {
    openapi: spec.openapi,
    info: spec.info,
    servers: spec.servers,
    paths: {},
  };

  const refs = new Set();
  ops.forEach(({ path, method, data }) => {
    if (!lite.paths[path]) lite.paths[path] = {};
    lite.paths[path][method] = data;
    collectRefs(data, refs);
  });

  if (spec.components) {
    lite.components = buildComponents(spec.components, refs);
  }
  return lite;
}

function main() {
  const spec = loadYaml(OPENAPI_PATH);
  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  const allOps = gatherOperations(spec);
  const { selected, removed } = selectOperations(allOps, cfg);

  removed.forEach(op => {
    console.log(`Dropped: ${op.opId}`);
  });

  const liteSpec = buildLiteSpec(spec, selected);
  saveYaml(OUTPUT_PATH, liteSpec);
  console.log(`Generated ${OUTPUT_PATH} with ${selected.length} operations`);
}

main();
