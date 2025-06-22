function logError(context, error) {
  const msg = error && error.message ? error.message : error;
  if (process.env.DEBUG) {
    console.error(`[${context}]`, msg, error && error.stack);
  } else {
    console.error(`[${context}]`, msg);
  }
}

function asyncHandler(fn) {
  return function(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { logError, asyncHandler };
