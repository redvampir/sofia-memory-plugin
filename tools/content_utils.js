const path = require('path');

function isBinaryExtension(filename = '') {
  const ext = path.extname(filename).toLowerCase();
  const binaryExts = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.bmp', '.ico', '.pdf', '.zip']);
  return binaryExts.has(ext);
}

function decodeContent(buffer, filename) {
  if (!Buffer.isBuffer(buffer)) {
    return { content: '', encoding: 'utf-8' };
  }
  const preferBase64 = isBinaryExtension(filename);
  const utf8String = buffer.toString('utf-8');
  const utf8IsSafe = Buffer.compare(Buffer.from(utf8String, 'utf-8'), buffer) === 0;

  if (!preferBase64 && utf8IsSafe) {
    return { content: utf8String, encoding: 'utf-8' };
  }
  if (!utf8IsSafe && buffer.includes(0)) {
    return { content: buffer.toString('base64'), encoding: 'base64' };
  }
  if (preferBase64) {
    return { content: buffer.toString('base64'), encoding: 'base64' };
  }
  return { content: utf8String, encoding: 'utf-8' };
}

module.exports = {
  isBinaryExtension,
  decodeContent,
};
