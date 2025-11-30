const express = require('express');
const crypto = require('crypto');
const tokenStore = require('../tools/token_store');
const logger = require('../utils/logger');

const router = express.Router();

function requireSystemToken(req, res, next) {
  const adminToken = process.env.SYSTEM_ADMIN_TOKEN || process.env.DEBUG_ADMIN_TOKEN;
  const token = req.header('x-admin-token') || req.header('authorization');
  const normalizedToken = token?.startsWith('Bearer ')
    ? token.slice('Bearer '.length)
    : token;

  if (!adminToken || !normalizedToken || normalizedToken !== adminToken) {
    return res.status(403).json({ status: 'forbidden', message: 'Недостаточно прав' });
  }

  return next();
}

function validateUserId(userId) {
  if (!userId || typeof userId !== 'string') {
    return { ok: false, message: 'userId обязателен и должен быть строкой' };
  }
  return { ok: true };
}

router.post('/api/system/rotate-token', requireSystemToken, async (req, res) => {
  const { userId } = req.body || {};
  const validation = validateUserId(userId);
  if (!validation.ok) {
    return res.status(400).json({ status: 'error', message: validation.message });
  }

  const newToken = crypto.randomBytes(24).toString('hex');
  await tokenStore.setToken(userId, newToken);
  logger.info('[system] токен обновлён', { userId });

  res.json({ status: 'success', token: newToken });
});

module.exports = router;
