/**
 * Graceful shutdown handler for production deployments
 *
 * Handles SIGTERM and SIGINT signals to ensure:
 * - No new requests are accepted
 * - Existing requests complete gracefully
 * - Resources are cleaned up properly
 */

const logger = require('./logger');

let isShuttingDown = false;
let server = null;

/**
 * Setup graceful shutdown handlers
 * @param {http.Server} httpServer - Express server instance
 */
function setupGracefulShutdown(httpServer) {
  server = httpServer;

  // Handle SIGTERM (Render, Kubernetes)
  process.on('SIGTERM', () => {
    logger.info('[shutdown] SIGTERM received, starting graceful shutdown...');
    shutdown('SIGTERM');
  });

  // Handle SIGINT (Ctrl+C)
  process.on('SIGINT', () => {
    logger.info('[shutdown] SIGINT received, starting graceful shutdown...');
    shutdown('SIGINT');
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('[shutdown] Uncaught exception:', error);
    shutdown('uncaughtException');
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('[shutdown] Unhandled rejection at:', promise, 'reason:', reason);
    // Don't shutdown on unhandled rejection in production
    // Just log it
  });

  logger.info('[shutdown] Graceful shutdown handlers configured');
}

/**
 * Perform graceful shutdown
 * @param {string} signal - Signal that triggered shutdown
 */
function shutdown(signal) {
  if (isShuttingDown) {
    logger.warn('[shutdown] Shutdown already in progress, ignoring duplicate signal');
    return;
  }

  isShuttingDown = true;
  logger.info(`[shutdown] Shutting down due to: ${signal}`);

  // Stop accepting new connections
  if (server) {
    server.close((err) => {
      if (err) {
        logger.error('[shutdown] Error closing server:', err);
        process.exit(1);
      }

      logger.info('[shutdown] Server closed successfully');
      logger.info('[shutdown] All connections closed, exiting gracefully');
      process.exit(0);
    });

    // Force shutdown after timeout
    const shutdownTimeout = setTimeout(() => {
      logger.error('[shutdown] Could not close connections in time, forcing shutdown');
      process.exit(1);
    }, 30000); // 30 seconds timeout

    // Don't keep the process running just for the timeout
    shutdownTimeout.unref();
  } else {
    logger.warn('[shutdown] No server instance, exiting immediately');
    process.exit(0);
  }
}

/**
 * Check if server is shutting down
 * @returns {boolean}
 */
function isShuttingDownNow() {
  return isShuttingDown;
}

/**
 * Middleware to reject requests during shutdown
 */
function rejectDuringShutdown(req, res, next) {
  if (isShuttingDown) {
    res.status(503).json({
      error: 'Server is shutting down',
      message: 'Please retry your request',
    });
    return;
  }
  next();
}

module.exports = {
  setupGracefulShutdown,
  isShuttingDown: isShuttingDownNow,
  rejectDuringShutdown,
};
