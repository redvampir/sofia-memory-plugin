// Логирование ошибок и обёртка для асинхронных функций
function logError(context, error) {
  const msg = error && error.message ? error.message : error;
  const extras = [];
  if (error && error.status) extras.push(`status=${error.status}`);
  if (error && error.githubMessage) extras.push(`detail=${error.githubMessage}`);
  const suffix = extras.length ? ` ${extras.join(' ')}` : '';
  if (process.env.DEBUG) {
    console.error(`[${context}]`, `${msg}${suffix}`, error && error.stack);
  } else {
    console.error(`[${context}]`, `${msg}${suffix}`);
  }
}

function asyncHandler(fn) {
  return function(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { logError, asyncHandler };
