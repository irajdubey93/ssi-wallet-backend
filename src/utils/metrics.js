const promClient = require('prom-client');

// Create a Registry
const register = new promClient.Registry();

// Add default metrics (process, memory, etc.)
promClient.collectDefaultMetrics({ register });

// Custom counters for operations
const authChallengeCounter = new promClient.Counter({
  name: 'ssi_wallet_auth_challenges_total',
  help: 'Total number of auth challenges issued',
  labelNames: ['status']
});

const authLoginCounter = new promClient.Counter({
  name: 'ssi_wallet_auth_logins_total',
  help: 'Total number of login attempts',
  labelNames: ['status']
});

const didOperationsCounter = new promClient.Counter({
  name: 'ssi_wallet_did_operations_total',
  help: 'Total number of DID operations',
  labelNames: ['operation', 'status']
});

const vcOperationsCounter = new promClient.Counter({
  name: 'ssi_wallet_vc_operations_total',
  help: 'Total number of VC operations',
  labelNames: ['operation', 'status']
});

const httpRequestsCounter = new promClient.Counter({
  name: 'ssi_wallet_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status']
});

const httpRequestDuration = new promClient.Histogram({
  name: 'ssi_wallet_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path', 'status'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5]
});

const encryptionOperationsCounter = new promClient.Counter({
  name: 'ssi_wallet_encryption_operations_total',
  help: 'Total number of encryption/decryption operations',
  labelNames: ['operation', 'status']
});

// Register all custom metrics
register.registerMetric(authChallengeCounter);
register.registerMetric(authLoginCounter);
register.registerMetric(didOperationsCounter);
register.registerMetric(vcOperationsCounter);
register.registerMetric(httpRequestsCounter);
register.registerMetric(httpRequestDuration);
register.registerMetric(encryptionOperationsCounter);

module.exports = {
  register,
  authChallengeCounter,
  authLoginCounter,
  didOperationsCounter,
  vcOperationsCounter,
  httpRequestsCounter,
  httpRequestDuration,
  encryptionOperationsCounter
};
