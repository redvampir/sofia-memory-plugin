/**
 * Advanced health check for production monitoring
 */

const fs = require('fs');
const path = require('path');

let serverStartTime = Date.now();

/**
 * Reset server start time (for testing)
 */
function resetStartTime() {
  serverStartTime = Date.now();
}

/**
 * Get uptime in human-readable format
 * @returns {string}
 */
function getUptime() {
  const uptimeMs = Date.now() - serverStartTime;
  const seconds = Math.floor(uptimeMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/**
 * Get application version from package.json
 * @returns {string}
 */
function getVersion() {
  try {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8')
    );
    return packageJson.version || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Check environment configuration
 * @returns {Object}
 */
function checkEnvironment() {
  return {
    nodeEnv: process.env.NODE_ENV || 'development',
    memoryMode: process.env.MEMORY_MODE || 'local',
    tokenSecretSet: !!process.env.TOKEN_SECRET,
    port: process.env.PORT || 10000,
  };
}

/**
 * Check memory usage
 * @returns {Object}
 */
function checkMemory() {
  const usage = process.memoryUsage();
  return {
    rss: `${Math.round(usage.rss / 1024 / 1024)}MB`,
    heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
    heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
    external: `${Math.round(usage.external / 1024 / 1024)}MB`,
  };
}

/**
 * Check disk space for cache directory
 * @returns {Object}
 */
function checkDiskSpace() {
  try {
    const cacheDir = path.join(__dirname, '..', 'tools', '.cache');

    if (!fs.existsSync(cacheDir)) {
      return { status: 'ok', message: 'Cache directory not created yet' };
    }

    // Simple check - just verify directory is accessible
    fs.accessSync(cacheDir, fs.constants.W_OK);

    return { status: 'ok', message: 'Cache directory writable' };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

/**
 * Detailed health check
 * @returns {Object}
 */
function detailedHealthCheck() {
  const env = checkEnvironment();
  const memory = checkMemory();
  const disk = checkDiskSpace();

  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: getUptime(),
    version: getVersion(),
    environment: env,
    resources: {
      memory,
      disk,
    },
    checks: {
      tokenSecret: env.tokenSecretSet ? 'configured' : 'missing',
      memoryMode: env.memoryMode,
      nodeVersion: process.version,
    },
  };
}

/**
 * Simple health check (for monitoring tools)
 * @returns {Object}
 */
function simpleHealthCheck() {
  return {
    status: 'ok',
    uptime: getUptime(),
    version: getVersion(),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Readiness check (are we ready to accept traffic?)
 * @returns {Object}
 */
function readinessCheck() {
  const env = checkEnvironment();
  const isReady = env.tokenSecretSet;

  return {
    ready: isReady,
    checks: {
      tokenSecret: env.tokenSecretSet,
      environment: env.nodeEnv,
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Liveness check (is the process alive?)
 * @returns {Object}
 */
function livenessCheck() {
  return {
    alive: true,
    timestamp: new Date().toISOString(),
    uptime: getUptime(),
  };
}

module.exports = {
  detailedHealthCheck,
  simpleHealthCheck,
  readinessCheck,
  livenessCheck,
  resetStartTime,
  getUptime,
  getVersion,
};
