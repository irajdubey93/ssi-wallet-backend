const { v4: uuidv4 } = require('uuid');

/**
 * Request ID middleware for correlation
 * Adds unique request ID to each request for tracing
 */
function requestIdMiddleware(req, res, next) {
  // Use existing request ID from header or generate new one
  const requestId = req.headers['x-request-id'] || uuidv4();
  
  // Attach to request object
  req.requestId = requestId;
  
  // Add to response headers
  res.setHeader('X-Request-ID', requestId);
  
  next();
}

module.exports = { requestIdMiddleware };
