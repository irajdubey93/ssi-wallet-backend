const { z } = require('zod');

// Base64 string validator
const base64String = z.string().regex(/^[A-Za-z0-9+/]+=*$/, 'Invalid base64 string');

// UUID validator
const uuid = z.string().uuid();

// Holder registration schema
const registerHolderSchema = z.object({
  holderId: uuid,
  publicKey: base64String.min(40, 'Public key too short')
});

// Challenge request schema
const challengeRequestSchema = z.object({
  holderId: uuid
});

// Login schema
const loginSchema = z.object({
  holderId: uuid,
  challengeId: uuid,
  signature: base64String
});

// DID creation schema (minimal - server generates the DID)
const createDIDSchema = z.object({
  // Optional metadata
  serviceName: z.string().max(100).optional(),
  serviceEndpoint: z.string().url().optional()
});

// VC creation schema
const createVCSchema = z.object({
  type: z.string().min(1).max(100),
  issuer: z.string().min(1).max(200),
  subjectId: z.string().min(1).max(200),
  issuedAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional(),
  claims: z.record(z.any()).optional() // Flexible claims object
});

// VC update schema (only status can be updated)
const updateVCSchema = z.object({
  status: z.enum(['active', 'revoked', 'expired'])
});

// Pagination query schema
const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20)
});

// VC filter query schema
const vcFilterSchema = paginationSchema.extend({
  type: z.string().optional(),
  status: z.enum(['active', 'revoked', 'expired']).optional()
});

/**
 * Validate request body against schema
 * @param {z.ZodSchema} schema - Zod schema
 * @returns {Function} Express middleware
 */
function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid request body',
        details: result.error.errors.map(e => ({
          path: e.path.join('.'),
          message: e.message
        }))
      });
    }
    req.validatedBody = result.data;
    next();
  };
}

/**
 * Validate query params against schema
 * @param {z.ZodSchema} schema - Zod schema
 * @returns {Function} Express middleware
 */
function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid query parameters',
        details: result.error.errors.map(e => ({
          path: e.path.join('.'),
          message: e.message
        }))
      });
    }
    req.validatedQuery = result.data;
    next();
  };
}

/**
 * Validate route params
 * @param {string} paramName - Parameter name
 * @param {z.ZodSchema} schema - Zod schema (default: uuid)
 * @returns {Function} Express middleware
 */
function validateParam(paramName, schema = uuid) {
  return (req, res, next) => {
    const result = schema.safeParse(req.params[paramName]);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation Error',
        message: `Invalid ${paramName}`,
        details: result.error.errors.map(e => ({
          path: paramName,
          message: e.message
        }))
      });
    }
    next();
  };
}

module.exports = {
  registerHolderSchema,
  challengeRequestSchema,
  loginSchema,
  createDIDSchema,
  createVCSchema,
  updateVCSchema,
  paginationSchema,
  vcFilterSchema,
  validateBody,
  validateQuery,
  validateParam,
  base64String,
  uuid
};
