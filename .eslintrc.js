module.exports = {
  env: {
    node: true,
    es2021: true,
    jest: true,
  },
  extends: [
    'eslint:recommended',
  ],
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module',
  },
  rules: {
    // === Naming Conventions ===
    // Enforce camelCase for variables and functions (наш новый стандарт!)
    'camelcase': ['warn', {
      properties: 'never',
      ignoreDestructuring: true,
      ignoreImports: true,
      ignoreGlobals: true,
      allow: [
        // Backward compatibility exports (deprecated)
        'get_needs_refresh',
        'set_needs_refresh',
        'get_tokens',
        'increment_tokens',
        'reset_tokens',
        'get_token_limit',
        'get_status',
        'register_user_prompt',
        'ensure_dir',
        'normalize_memory_path',
        'read_memory',
        'save_memory',
        'save_memory_with_index',
        'get_file',
        'auto_recover_context',
        'load_memory_to_context',
        'load_context_from_index',
        // Legacy function names (to be removed)
        '_check_context_for_user',
        '_process_users_in_batches',
        // Database/External API field names
        'user_id',
        'file_path',
        'last_accessed',
        'access_count',
        'edit_count',
        'context_priority',
        'importance_score',
        'needs_refresh',
      ],
    }],

    // === Code Quality ===
    'no-console': 'off', // We need console for server logs
    'no-unused-vars': ['warn', {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
    }],
    'no-var': 'error', // Use const/let instead
    'prefer-const': 'warn',
    'no-duplicate-imports': 'error',

    // === Security ===
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'no-process-env': 'off', // We use process.env extensively

    // === Best Practices ===
    'eqeqeq': ['warn', 'always', { null: 'ignore' }],
    'curly': ['warn', 'multi-line'],
    'no-throw-literal': 'error',
    'prefer-promise-reject-errors': 'warn',

    // === Async/Await ===
    'no-async-promise-executor': 'error',
    'require-await': 'warn',
    'no-return-await': 'warn',

    // === Style (relaxed for now) ===
    'indent': ['warn', 2, { SwitchCase: 1 }],
    'quotes': ['warn', 'single', { avoidEscape: true }],
    'semi': ['warn', 'always'],
    'comma-dangle': ['warn', 'always-multiline'],
    'no-trailing-spaces': 'warn',
    'eol-last': ['warn', 'always'],

    // === Complexity ===
    'complexity': ['warn', 20],
    'max-depth': ['warn', 4],
    'max-nested-callbacks': ['warn', 4],
    'max-params': ['warn', 6],
  },
  overrides: [
    {
      // TypeScript files
      files: ['*.ts', '*.tsx'],
      parser: '@typescript-eslint/parser',
      plugins: ['@typescript-eslint'],
      extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
      ],
      rules: {
        '@typescript-eslint/no-explicit-any': 'warn',
        '@typescript-eslint/explicit-module-boundary-types': 'off',
      },
    },
    {
      // Test files - more relaxed rules
      files: ['tests/**/*.js', '**/*.test.js', '**/*.spec.js'],
      env: {
        jest: true,
        node: true,
      },
      rules: {
        'no-console': 'off',
        'max-nested-callbacks': 'off',
        'max-params': 'off',
      },
    },
    {
      // Legacy files - snake_case allowed (temporary)
      files: [
        'logic/**/*.js',
        'tools/index_utils.js',
        'tools/memory_*.js',
        'src/context.js',
      ],
      rules: {
        'camelcase': 'off',
      },
    },
  ],
  ignorePatterns: [
    'node_modules/',
    'memory/',
    'config/',
    '.cache/',
    'coverage/',
    '*.min.js',
  ],
};
