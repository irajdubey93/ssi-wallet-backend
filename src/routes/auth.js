const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');
const { generateSalt, generateNonce, verifySignature } = require('../utils/encryption');
const { generateToken } = require('../middleware/auth');
const { authChallengeCounter, authLoginCounter } = require('../utils/metrics');
const {
  registerHolderSchema,
  challengeRequestSchema,
  loginSchema,
  validateBody
} = require('../utils/validators');

const router = express.Router();
const prisma = new PrismaClient();

const CHALLENGE_TTL_SECONDS = parseInt(process.env.CHALLENGE_EXPIRES_SECONDS) || 300;

router.post('/register', validateBody(registerHolderSchema), async (req, res, next) => {
  try {
    const { holderId, publicKey } = req.validatedBody;
    
    const existingHolder = await prisma.holder.findUnique({ where: { id: holderId } });
    if (existingHolder) {
      return res.status(409).json({ error: 'Conflict', message: 'Holder already registered' });
    }
    
    const existingKey = await prisma.holder.findUnique({ where: { publicKey } });
    if (existingKey) {
      return res.status(409).json({ error: 'Conflict', message: 'Public key already registered' });
    }
    
    const salt = generateSalt();
    const holder = await prisma.holder.create({
      data: { id: holderId, publicKey, salt }
    });
    
    logger.info({ requestId: req.requestId, holderId }, 'Holder registered');
    
    res.status(201).json({
      message: 'Registration successful',
      holderId: holder.id,
      createdAt: holder.createdAt
    });
  } catch (error) {
    next(error);
  }
});

router.post('/challenge', validateBody(challengeRequestSchema), async (req, res, next) => {
  try {
    const { holderId } = req.validatedBody;
    
    const holder = await prisma.holder.findUnique({ where: { id: holderId } });
    if (!holder) {
      authChallengeCounter.inc({ status: 'not_found' });
      return res.status(404).json({ error: 'Not Found', message: 'Holder not found' });
    }
    
    await prisma.challenge.deleteMany({
      where: {
        holderId,
        OR: [{ expiresAt: { lt: new Date() } }, { used: true }]
      }
    });
    
    const nonce = generateNonce();
    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_SECONDS * 1000);
    
    const challenge = await prisma.challenge.create({
      data: { holderId, nonce, expiresAt }
    });
    
    authChallengeCounter.inc({ status: 'success' });
    logger.info({ requestId: req.requestId, holderId, challengeId: challenge.id }, 'Challenge issued');
    
    res.status(200).json({
      challengeId: challenge.id,
      nonce: challenge.nonce,
      expiresAt: challenge.expiresAt
    });
  } catch (error) {
    authChallengeCounter.inc({ status: 'error' });
    next(error);
  }
});

router.post('/login', validateBody(loginSchema), async (req, res, next) => {
  try {
    const { holderId, challengeId, signature } = req.validatedBody;
    
    const challenge = await prisma.challenge.findUnique({
      where: { id: challengeId },
      include: { holder: true }
    });
    
    if (!challenge) {
      authLoginCounter.inc({ status: 'challenge_not_found' });
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid challenge' });
    }
    
    if (challenge.holderId !== holderId) {
      authLoginCounter.inc({ status: 'holder_mismatch' });
      return res.status(401).json({ error: 'Unauthorized', message: 'Challenge does not belong to this holder' });
    }
    
    if (challenge.expiresAt < new Date()) {
      authLoginCounter.inc({ status: 'expired' });
      logger.warn({ requestId: req.requestId, holderId, challengeId }, 'Challenge expired');
      return res.status(401).json({ error: 'Unauthorized', message: 'Challenge expired' });
    }
    
    if (challenge.used) {
      authLoginCounter.inc({ status: 'already_used' });
      return res.status(401).json({ error: 'Unauthorized', message: 'Challenge already used' });
    }
    
    const isValid = verifySignature(challenge.nonce, signature, challenge.holder.publicKey);
    if (!isValid) {
      authLoginCounter.inc({ status: 'invalid_signature' });
      logger.warn({ requestId: req.requestId, holderId }, 'Invalid signature');
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid signature' });
    }
    
    await prisma.challenge.update({
      where: { id: challengeId },
      data: { used: true }
    });
    
    const sessionId = uuidv4();
    const token = generateToken(holderId, sessionId);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    
    await prisma.session.create({
      data: { id: sessionId, holderId, token, expiresAt }
    });
    
    authLoginCounter.inc({ status: 'success' });
    logger.info({ requestId: req.requestId, holderId, sessionId }, 'Login successful');
    
    res.status(200).json({ token, expiresAt, holderId });
  } catch (error) {
    authLoginCounter.inc({ status: 'error' });
    next(error);
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      await prisma.session.deleteMany({ where: { token } });
      logger.info({ requestId: req.requestId }, 'Logout successful');
    }
    
    res.status(200).json({ message: 'Logged out' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
