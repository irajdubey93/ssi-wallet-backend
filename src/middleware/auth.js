const jwt = require('jsonwebtoken');
const { logger } = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

/**
 * Authentication middleware
 * Verifies JWT token from Authorization header
 */
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logger.warn({ requestId: req.requestId }, 'Missing or invalid authorization header');
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing or invalid authorization header'
    });
  }
  
  const token = authHeader.substring(7);
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.holderId = decoded.holderId;
    req.sessionId = decoded.sessionId;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      logger.warn({ requestId: req.requestId }, 'Token expired');
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Token expired'
      });
    }
    
    logger.warn({ requestId: req.requestId, error: error.message }, 'Invalid token');
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid token'
    });
  }
}

/**
 * Passphrase extraction middleware
 * Extracts wallet passphrase from header for encryption operations
 */
function passphraseMiddleware(req, res, next) {
  const passphrase = req.headers['x-wallet-passphrase'];
  
  if (!passphrase) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Missing X-Wallet-Passphrase header'
    });
  }
  
  if (passphrase.length < 8) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Passphrase must be at least 8 characters'
    });
  }
  
  // Attach passphrase to request (used transiently)
  req.passphrase = passphrase;
  
  next();
}

/**
 * Generate JWT token
 * @param {string} holderId - Holder ID
 * @param {string} sessionId - Session ID
 * @returns {string} JWT token
 */
function generateToken(holderId, sessionId) {
  return jwt.sign(
    { holderId, sessionId },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
  );
}

module.exports = {
  authMiddleware,
  passphraseMiddleware,
  generateToken,
  JWT_SECRET
};
