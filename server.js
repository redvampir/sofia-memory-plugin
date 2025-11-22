const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;
const storageRoot = path.join(__dirname, 'memory_data');
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || process.env.LOCAL_API_TOKEN || process.env.DEBUG_ADMIN_TOKEN || '';
const ALLOW_INSECURE_LOCAL = process.env.ALLOW_INSECURE_LOCAL === '1';

app.use(cors());
app.use(express.json());
app.use('/.well-known', express.static(path.join(__dirname, '.well-known')));

app.get('/ping', (_req, res) => {
  res.json({ ok: true, message: 'pong' });
});

function extractAdminToken(req) {
  const header = req.header('x-admin-token') || req.header('authorization');
  if (!header) return '';
  return header.startsWith('Bearer ') ? header.slice('Bearer '.length) : header;
}

function ensureLocalAuth(req, res) {
  if (ALLOW_INSECURE_LOCAL) return true;
  if (!ADMIN_TOKEN) {
    console.error('[AUTH] ADMIN_TOKEN/LOCAL_API_TOKEN/DEBUG_ADMIN_TOKEN is not set');
    res.status(500).json({ status: 'error', message: 'Admin token is not configured on the server' });
    return false;
  }
  const provided = extractAdminToken(req);
  if (!provided || provided !== ADMIN_TOKEN) {
    res.status(401).json({ status: 'error', message: 'Unauthorized: missing or invalid admin token' });
    return false;
  }
  return true;
}

function resolveFileName(rawName) {
  const safeName = typeof rawName === 'string' && rawName.trim() !== ''
    ? rawName.trim()
    : 'memory.json';

  return path.basename(safeName);
}

function methodNotAllowed(res, allowedMethods) {
  const allow = Array.isArray(allowedMethods) ? allowedMethods : [allowedMethods];
  res.setHeader('Allow', allow.join(', '));
  return res
    .status(405)
    .json({ status: 'error', message: `Method not allowed. Use ${allow.join(', ')}.` });
}

function saveMemoryHandler(req, res) {
  if (!ensureLocalAuth(req, res)) return;

  const { fileName, content } = req.body || {};
  if (content === undefined) {
    return res.status(400).json({ status: 'error', message: '���� content �����������' });
  }

  const targetName = resolveFileName(fileName);
  const targetPath = path.join(storageRoot, targetName);

  try {
    fs.mkdirSync(storageRoot, { recursive: true });
    const payload = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    fs.writeFileSync(targetPath, payload, 'utf8');
    return res.status(200).json({ status: 'ok', file: targetName });
  } catch (error) {
    console.error('[SAVE] ������ ������ �����', error);
    return res.status(500).json({ status: 'error', message: '�� ������� ��������� ����' });
  }
}

function readMemoryHandler(req, res) {
  const payload = req.method === 'POST' ? req.body || {} : req.query;
  const targetName = resolveFileName(payload.fileName);
  const targetPath = path.join(storageRoot, targetName);

  try {
    if (!fs.existsSync(targetPath)) {
      return res.status(404).json({ status: 'not_found', message: '���� �� ������' });
    }

    const data = fs.readFileSync(targetPath, 'utf8');
    return res.status(200).json({ status: 'ok', file: targetName, content: data });
  } catch (error) {
    console.error('[READ] ������ ������ �����', error);
    return res.status(500).json({ status: 'error', message: '�� ������� ��������� ����' });
  }
}

app.post('/api/memory/save', saveMemoryHandler);
app.post('/api/saveMemory', saveMemoryHandler);
app.get('/api/saveMemory', (_req, res) => methodNotAllowed(res, ['POST']));

app.get('/api/memory/read', readMemoryHandler);
app.get('/api/readMemory', readMemoryHandler);
app.post('/api/readMemory', readMemoryHandler);

app.listen(PORT, () => {
  console.log(`[START] ������ ������� �� ����� ${PORT}`);
});

module.exports = app;
