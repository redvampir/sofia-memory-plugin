const path = require('path');

function normalize(p){
  return p.replace(/\\+/g, '/').replace(/^\/+/, '').replace(/^\.\/+/, '');
}

function checkAccess(filePath, mode = 'read') {
  const rel = normalize(filePath);
  if (rel.startsWith('memory/')) {
    return { allowed: true };
  }
  if (rel.startsWith('code/') || rel.startsWith('src/') || rel.startsWith('logic/')) {
    if (mode === 'write') {
      return { allowed: false, message: 'Доступ к изменениям кода проекта запрещен' };
    }
    return { allowed: true };
  }
  return { allowed: mode === 'read', message: mode === 'write' ? 'Доступ к изменениям кода проекта запрещен' : 'Недостаточно прав' };
}

module.exports = { checkAccess };
