const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
    bindings: (bindings) => ({
      pid: bindings.pid,
      host: bindings.hostname,
      service: 'ssi-wallet'
    })
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Never log these fields (security)
  redact: {
    paths: [
      'req.headers["x-wallet-passphrase"]',
      'passphrase',
      'privateKey',
      'derivedKey',
      'decryptedPayload',
      'secret'
    ],
    censor: '[REDACTED]'
  }
});

module.exports = { logger };
