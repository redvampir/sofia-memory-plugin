const assert = require('assert');

function loadModule() {
  delete require.cache[require.resolve('../scripts/generate_openapi')];
  return require('../scripts/generate_openapi');
}

function withEnv(env, fn) {
  const previous = {};
  Object.entries(env).forEach(([key, value]) => {
    previous[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  });

  try {
    fn();
  } finally {
    Object.entries(previous).forEach(([key, value]) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
  }
}

function patchConsole(method) {
  const buffer = [];
  const original = console[method];
  console[method] = (...args) => buffer.push(args.join(' '));
  return () => {
    console[method] = original;
    return buffer;
  };
}

(function run() {
  withEnv({ NODE_ENV: 'development', PUBLIC_BASE_URL: undefined, RENDER: undefined }, () => {
    const restoreLog = patchConsole('log');
    const { resolveBaseUrl } = loadModule();
    const baseUrl = resolveBaseUrl();
    const logs = restoreLog();

    assert.strictEqual(baseUrl, 'http://localhost:10000');
    assert(logs.some(msg => msg.includes('dev-режим')));
  });

  withEnv({ NODE_ENV: 'production', PUBLIC_BASE_URL: undefined, RENDER: undefined }, () => {
    const restoreError = patchConsole('error');
    const originalExit = process.exit;
    let exitCode;
    let errors;
    process.exit = code => {
      exitCode = code;
      throw new Error('exit');
    };

    try {
      const { resolveBaseUrl } = loadModule();
      assert.throws(() => resolveBaseUrl(), /exit/);
      assert.strictEqual(exitCode, 1);
      errors = restoreError();
      assert(errors.some(msg => msg.includes('обязателен в продакшене')));
    } finally {
      process.exit = originalExit;
      if (!errors) restoreError();
    }
  });

  withEnv({ PUBLIC_BASE_URL: 'https://example.com/api/' }, () => {
    const { resolveBaseUrl } = loadModule();
    const baseUrl = resolveBaseUrl({ required: false });
    assert.strictEqual(baseUrl, 'https://example.com/api');
  });

  console.log('generate_openapi tests passed');
})();
