// Lazy load ESLint only when needed (it's in devDependencies)
async function lintText(source) {
  try {
    // Dynamic require - only loads when linting is actually called
    const { ESLint } = require('eslint');

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
  } catch (error) {
    // ESLint not available (production without devDependencies)
    // Return empty array - linting is optional
    if (error.code === 'MODULE_NOT_FOUND') {
      console.warn('[code_analyzer] ESLint not available, skipping lint');
      return [];
    }
    throw error;
  }
}

module.exports = { lintText };
