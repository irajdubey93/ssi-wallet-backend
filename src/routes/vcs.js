const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { logger } = require('../utils/logger');
const { deriveKey, encrypt, decrypt } = require('../utils/encryption');
const { authMiddleware, passphraseMiddleware } = require('../middleware/auth');
const { vcOperationsCounter } = require('../utils/metrics');
const {
  createVCSchema,
  updateVCSchema,
  vcFilterSchema,
  validateBody,
  validateQuery,
  validateParam
} = require('../utils/validators');

const router = express.Router();
const prisma = new PrismaClient();

router.post('/',
  authMiddleware,
  passphraseMiddleware,
  validateBody(createVCSchema),
  async (req, res, next) => {
    try {
      const { holderId, passphrase, requestId } = req;
      const { type, issuer, subjectId, issuedAt, expiresAt, claims } = req.validatedBody;
      
      const holder = await prisma.holder.findUnique({ where: { id: holderId } });
      if (!holder) {
        vcOperationsCounter.inc({ operation: 'create', status: 'holder_not_found' });
        return res.status(404).json({ error: 'Not Found', message: 'Holder not found' });
      }
      
      const vcPayload = {
        '@context': [
          'https://www.w3.org/2018/credentials/v1',
          'https://www.w3.org/2018/credentials/examples/v1'
        ],
        type: ['VerifiableCredential', type],
        issuer,
        issuanceDate: issuedAt || new Date().toISOString(),
        expirationDate: expiresAt || null,
        credentialSubject: { id: subjectId, ...claims }
      };
      
      const key = await deriveKey(passphrase, holder.salt);
      const { ciphertext, iv, authTag } = encrypt(JSON.stringify(vcPayload), key);
      
      const vc = await prisma.verifiableCredential.create({
        data: {
          holderId,
          type,
          issuer,
          subjectId,
          status: 'active',
          issuedAt: new Date(issuedAt || Date.now()),
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          credentialCipher: ciphertext,
          iv,
          authTag
        }
      });
      
      vcOperationsCounter.inc({ operation: 'create', status: 'success' });
      logger.info({ requestId, holderId, vcId: vc.id, type }, 'VC created');
      
      res.status(201).json({
        id: vc.id,
        type: vc.type,
        issuer: vc.issuer,
        subjectId: vc.subjectId,
        status: vc.status,
        issuedAt: vc.issuedAt,
        expiresAt: vc.expiresAt,
        createdAt: vc.createdAt
      });
    } catch (error) {
      vcOperationsCounter.inc({ operation: 'create', status: 'error' });
      next(error);
    }
  }
);

router.get('/',
  authMiddleware,
  validateQuery(vcFilterSchema),
  async (req, res, next) => {
    try {
      const { holderId, requestId } = req;
      const { page, limit, type, status } = req.validatedQuery;
      
      const where = { holderId };
      if (type) where.type = type;
      if (status) where.status = status;
      
      const total = await prisma.verifiableCredential.count({ where });
      
      const vcs = await prisma.verifiableCredential.findMany({
        where,
        select: {
          id: true,
          type: true,
          issuer: true,
          subjectId: true,
          status: true,
          issuedAt: true,
          expiresAt: true,
          createdAt: true,
          updatedAt: true
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      });
      
      logger.info({ requestId, holderId, count: vcs.length }, 'VCs listed');
      
      res.status(200).json({
        data: vcs,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get('/:id',
  authMiddleware,
  passphraseMiddleware,
  validateParam('id'),
  async (req, res, next) => {
    try {
      const { holderId, passphrase, requestId } = req;
      const { id } = req.params;
      
      const holder = await prisma.holder.findUnique({ where: { id: holderId } });
      if (!holder) {
        return res.status(404).json({ error: 'Not Found', message: 'Holder not found' });
      }
      
      const vc = await prisma.verifiableCredential.findFirst({ where: { id, holderId } });
      if (!vc) {
        vcOperationsCounter.inc({ operation: 'read', status: 'not_found' });
        return res.status(404).json({ error: 'Not Found', message: 'VC not found' });
      }
      
      const key = await deriveKey(passphrase, holder.salt);
      
      try {
        const decryptedPayload = decrypt(vc.credentialCipher, vc.iv, vc.authTag, key);
        const credential = JSON.parse(decryptedPayload);
        
        vcOperationsCounter.inc({ operation: 'read', status: 'success' });
        logger.info({ requestId, holderId, vcId: id }, 'VC retrieved');
        
        res.status(200).json({
          id: vc.id,
          type: vc.type,
          issuer: vc.issuer,
          subjectId: vc.subjectId,
          status: vc.status,
          issuedAt: vc.issuedAt,
          expiresAt: vc.expiresAt,
          credential,
          createdAt: vc.createdAt,
          updatedAt: vc.updatedAt
        });
      } catch (decryptError) {
        logger.warn({ requestId, holderId, vcId: id }, 'Decryption failed - invalid passphrase');
        return res.status(403).json({ error: 'Forbidden', message: 'Invalid passphrase' });
      }
    } catch (error) {
      vcOperationsCounter.inc({ operation: 'read', status: 'error' });
      next(error);
    }
  }
);

router.patch('/:id',
  authMiddleware,
  validateParam('id'),
  validateBody(updateVCSchema),
  async (req, res, next) => {
    try {
      const { holderId, requestId } = req;
      const { id } = req.params;
      const { status } = req.validatedBody;
      
      const vc = await prisma.verifiableCredential.findFirst({ where: { id, holderId } });
      if (!vc) {
        vcOperationsCounter.inc({ operation: 'update', status: 'not_found' });
        return res.status(404).json({ error: 'Not Found', message: 'VC not found' });
      }
      
      const updated = await prisma.verifiableCredential.update({
        where: { id },
        data: { status },
        select: {
          id: true,
          type: true,
          issuer: true,
          subjectId: true,
          status: true,
          issuedAt: true,
          expiresAt: true,
          createdAt: true,
          updatedAt: true
        }
      });
      
      vcOperationsCounter.inc({ operation: 'update', status: 'success' });
      logger.info({ requestId, holderId, vcId: id, newStatus: status }, 'VC updated');
      
      res.status(200).json(updated);
    } catch (error) {
      vcOperationsCounter.inc({ operation: 'update', status: 'error' });
      next(error);
    }
  }
);

router.delete('/:id',
  authMiddleware,
  validateParam('id'),
  async (req, res, next) => {
    try {
      const { holderId, requestId } = req;
      const { id } = req.params;
      
      const vc = await prisma.verifiableCredential.findFirst({ where: { id, holderId } });
      if (!vc) {
        vcOperationsCounter.inc({ operation: 'delete', status: 'not_found' });
        return res.status(404).json({ error: 'Not Found', message: 'VC not found' });
      }
      
      await prisma.verifiableCredential.delete({ where: { id } });
      
      vcOperationsCounter.inc({ operation: 'delete', status: 'success' });
      logger.info({ requestId, holderId, vcId: id }, 'VC deleted');
      
      res.status(204).send();
    } catch (error) {
      vcOperationsCounter.inc({ operation: 'delete', status: 'error' });
      next(error);
    }
  }
);

module.exports = router;
