/**
 * Environment variables validator
 *
 * Validates required and optional environment variables on startup
 * Prevents server from starting with invalid configuration
 */

const REQUIRED_VARS = {
  TOKEN_SECRET: {
    description: 'Secret key for encrypting GitHub tokens',
    validate: (value) => value && value.length >= 32,
    error: 'TOKEN_SECRET must be at least 32 characters long',
  },
};

const OPTIONAL_VARS = {
  PORT: {
    description: 'Server port',
    default: '10000',
    validate: (value) => !value || !isNaN(parseInt(value)),
    error: 'PORT must be a valid number',
  },
  NODE_ENV: {
    description: 'Node environment (development, production, test)',
    default: 'development',
    validate: (value) => !value || ['development', 'production', 'test'].includes(value),
    error: 'NODE_ENV must be one of: development, production, test',
  },
  MEMORY_MODE: {
    description: 'Memory storage mode (local, github)',
    default: 'local',
    validate: (value) => !value || ['local', 'github'].includes(value),
    error: 'MEMORY_MODE must be one of: local, github',
  },
  PUBLIC_BASE_URL: {
    description: 'Public base URL for OpenAPI spec (required for Render)',
    default: null,
  },
  GITHUB_REPO: {
    description: 'Default GitHub repository URL',
    default: null,
  },
  DEBUG_ADMIN_TOKEN: {
    description: 'Admin token for debug endpoints',
    default: null,
  },
};

/**
 * Validate environment variables
 * @param {boolean} strict - Throw error on missing required vars
 * @returns {Object} Validation result
 */
function validateEnv(strict = true) {
  const errors = [];
  const warnings = [];
  const config = {};

  // Check required variables
  Object.entries(REQUIRED_VARS).forEach(([key, spec]) => {
    const value = process.env[key];

    if (!value) {
      const error = `Missing required environment variable: ${key} (${spec.description})`;
      errors.push(error);

      if (strict) {
        throw new Error(error);
      }
    } else if (spec.validate && !spec.validate(value)) {
      const error = `Invalid ${key}: ${spec.error}`;
      errors.push(error);

      if (strict) {
        throw new Error(error);
      }
    } else {
      config[key] = value;
    }
  });

  // Check optional variables
  Object.entries(OPTIONAL_VARS).forEach(([key, spec]) => {
    const value = process.env[key] || spec.default;

    if (spec.validate && value && !spec.validate(value)) {
      const warning = `Invalid ${key}: ${spec.error}. Using default: ${spec.default}`;
      warnings.push(warning);
      config[key] = spec.default;
    } else {
      config[key] = value;
    }

    if (!process.env[key] && spec.default) {
      warnings.push(`${key} not set, using default: ${spec.default}`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    config,
  };
}

/**
 * Print environment configuration
 * @param {Object} config - Configuration object
 */
function printConfig(config) {
  console.log('\n📋 Environment Configuration:');
  console.log('================================');

  Object.entries(config).forEach(([key, value]) => {
    // Mask sensitive values
    const displayValue = key === 'TOKEN_SECRET' || key.includes('TOKEN')
      ? '***'
      : value || '(not set)';

    console.log(`  ${key}: ${displayValue}`);
  });

  console.log('================================\n');
}

/**
 * Validate and log environment on startup
 */
function validateAndLog() {
  try {
    const result = validateEnv(true);

    if (result.warnings.length > 0) {
      console.log('\n⚠️  Environment Warnings:');
      result.warnings.forEach(w => console.log(`  - ${w}`));
    }

    printConfig(result.config);

    return result.config;
  } catch (error) {
    console.error('\n❌ Environment Validation Failed:');
    console.error(`  ${error.message}\n`);
    process.exit(1);
  }
}

module.exports = {
  validateEnv,
  validateAndLog,
  printConfig,
  REQUIRED_VARS,
  OPTIONAL_VARS,
};
