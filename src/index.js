require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const pinoHttp = require('pino-http');
const swaggerUi = require('swagger-ui-express');

const { logger } = require('./utils/logger');
const { register } = require('./utils/metrics');
const { requestIdMiddleware } = require('./middleware/requestId');
const { metricsMiddleware } = require('./middleware/metricsMiddleware');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth');
const didRoutes = require('./routes/did');
const vcsRoutes = require('./routes/vcs');
const openApiSpec = require('./openapi.json');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"]
    }
  }
}));

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Wallet-Passphrase', 'X-Request-ID']
}));

app.use(requestIdMiddleware);

app.use(pinoHttp({
  logger,
  customProps: (req) => ({ requestId: req.requestId }),
  redact: ['req.headers["x-wallet-passphrase"]']
}));

app.use(metricsMiddleware);

app.use(express.json({ limit: '1mb' }));

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    res.status(500).end(error.message);
  }
});

app.get('/api/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    res.status(500).end(error.message);
  }
});

app.get('/openapi.json', (req, res) => res.json(openApiSpec));
app.get('/api/openapi.json', (req, res) => res.json(openApiSpec));

app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'SSI Wallet API'
}));

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'SSI Wallet API'
}));

app.use('/api/auth', authRoutes);
app.use('/api/did', didRoutes);
app.use('/api/vcs', vcsRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, '0.0.0.0', () => {
    logger.info({ port: PORT }, 'Server started');
    console.log(`Server: http://localhost:${PORT}`);
    console.log(`Docs:   http://localhost:${PORT}/docs`);
  });
}

module.exports = app;
