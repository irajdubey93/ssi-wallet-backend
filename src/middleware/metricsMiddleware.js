const { httpRequestsCounter, httpRequestDuration } = require('../utils/metrics');

/**
 * Metrics middleware to track HTTP requests
 */
function metricsMiddleware(req, res, next) {
  const start = process.hrtime();
  
  // Override res.end to capture metrics
  const originalEnd = res.end;
  res.end = function(...args) {
    // Calculate duration
    const diff = process.hrtime(start);
    const durationSeconds = diff[0] + diff[1] / 1e9;
    
    // Get normalized path (remove IDs for aggregation)
    const normalizedPath = normalizePath(req.path);
    
    // Record metrics
    httpRequestsCounter.inc({
      method: req.method,
      path: normalizedPath,
      status: res.statusCode
    });
    
    httpRequestDuration.observe({
      method: req.method,
      path: normalizedPath,
      status: res.statusCode
    }, durationSeconds);
    
    originalEnd.apply(res, args);
  };
  
  next();
}

/**
 * Normalize path by replacing UUIDs with :id placeholder
 */
function normalizePath(path) {
  // Replace UUIDs with :id
  return path.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    ':id'
  );
}

module.exports = { metricsMiddleware };
