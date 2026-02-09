const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');
const { deriveKey, encrypt, decrypt } = require('../utils/encryption');
const { authMiddleware, passphraseMiddleware } = require('../middleware/auth');
const { didOperationsCounter } = require('../utils/metrics');
const { createDIDSchema, validateBody } = require('../utils/validators');

const router = express.Router();
const prisma = new PrismaClient();

router.post('/',
  authMiddleware,
  passphraseMiddleware,
  validateBody(createDIDSchema),
  async (req, res, next) => {
    try {
      const { holderId, passphrase, requestId } = req;
      const { serviceName, serviceEndpoint } = req.validatedBody || {};
      
      const holder = await prisma.holder.findUnique({ where: { id: holderId } });
      if (!holder) {
        didOperationsCounter.inc({ operation: 'create', status: 'holder_not_found' });
        return res.status(404).json({ error: 'Not Found', message: 'Holder not found' });
      }
      
      const existingDID = await prisma.dID.findFirst({ where: { holderId } });
      if (existingDID) {
        didOperationsCounter.inc({ operation: 'create', status: 'already_exists' });
        return res.status(409).json({ error: 'Conflict', message: 'DID already exists for this holder' });
      }
      
      const didId = uuidv4();
      const didIdentifier = `did:example:${didId}`;
      
      const didDocument = {
        '@context': [
          'https://www.w3.org/ns/did/v1',
          'https://w3id.org/security/suites/ed25519-2020/v1'
        ],
        id: didIdentifier,
        verificationMethod: [{
          id: `${didIdentifier}#key-1`,
          type: 'Ed25519VerificationKey2020',
          controller: didIdentifier,
          publicKeyBase64: holder.publicKey
        }],
        authentication: [`${didIdentifier}#key-1`],
        assertionMethod: [`${didIdentifier}#key-1`],
        created: new Date().toISOString(),
        updated: new Date().toISOString()
      };
      
      if (serviceName && serviceEndpoint) {
        didDocument.service = [{
          id: `${didIdentifier}#${serviceName.toLowerCase().replace(/\s+/g, '-')}`,
          type: serviceName,
          serviceEndpoint
        }];
      }
      
      const key = await deriveKey(passphrase, holder.salt);
      const { ciphertext, iv, authTag } = encrypt(JSON.stringify(didDocument), key);
      
      const did = await prisma.dID.create({
        data: { holderId, didIdentifier, documentCipher: ciphertext, iv, authTag }
      });
      
      didOperationsCounter.inc({ operation: 'create', status: 'success' });
      logger.info({ requestId, holderId, didIdentifier }, 'DID created');
      
      res.status(201).json({
        id: did.id,
        didIdentifier: did.didIdentifier,
        createdAt: did.createdAt
      });
    } catch (error) {
      didOperationsCounter.inc({ operation: 'create', status: 'error' });
      next(error);
    }
  }
);

router.get('/',
  authMiddleware,
  passphraseMiddleware,
  async (req, res, next) => {
    try {
      const { holderId, passphrase, requestId } = req;
      
      const holder = await prisma.holder.findUnique({ where: { id: holderId } });
      if (!holder) {
        return res.status(404).json({ error: 'Not Found', message: 'Holder not found' });
      }
      
      const did = await prisma.dID.findFirst({ where: { holderId } });
      if (!did) {
        return res.status(404).json({ error: 'Not Found', message: 'No DID found for this holder' });
      }
      
      const key = await deriveKey(passphrase, holder.salt);
      
      try {
        const decryptedDocument = decrypt(did.documentCipher, did.iv, did.authTag, key);
        const didDocument = JSON.parse(decryptedDocument);
        
        logger.info({ requestId, holderId, didIdentifier: did.didIdentifier }, 'DID retrieved');
        
        res.status(200).json({
          id: did.id,
          didIdentifier: did.didIdentifier,
          document: didDocument,
          createdAt: did.createdAt,
          updatedAt: did.updatedAt
        });
      } catch (decryptError) {
        logger.warn({ requestId, holderId }, 'Decryption failed - invalid passphrase');
        return res.status(403).json({ error: 'Forbidden', message: 'Invalid passphrase' });
      }
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
