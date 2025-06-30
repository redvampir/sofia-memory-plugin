const { ESLint } = require('eslint');

async function lintText(source) {
  const eslint = new ESLint({
    useEslintrc: false,
    baseConfig: {
      extends: ['eslint:recommended'],
      env: { node: true, es2020: true }
    }
  });
  const results = await eslint.lintText(source);
  const messages = results[0] ? results[0].messages : [];
  return messages.map(m => ({ line: m.line, column: m.column, message: m.message, rule: m.ruleId }));
}

module.exports = { lintText };
