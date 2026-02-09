const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
const app = require('../../index');
const { generateKeyPair, sign } = require('../../utils/encryption');
const { prisma } = require('../setup');

describe('DID Integration Tests', () => {
  let testHolder;
  let keyPair;
  let authToken;
  const passphrase = 'test-passphrase-123';

  beforeEach(async () => {
    keyPair = generateKeyPair();
    testHolder = {
      holderId: uuidv4(),
      publicKey: keyPair.publicKey
    };

    // Register and login
    await request(app).post('/api/auth/register').send(testHolder).expect(201);
    const challengeRes = await request(app).post('/api/auth/challenge').send({ holderId: testHolder.holderId }).expect(200);
    const signature = sign(challengeRes.body.nonce, keyPair.privateKey);
    const loginRes = await request(app).post('/api/auth/login').send({
      holderId: testHolder.holderId,
      challengeId: challengeRes.body.challengeId,
      signature
    }).expect(200);
    authToken = loginRes.body.token;
  });

  afterEach(async () => {
    await prisma.dID.deleteMany();
    await prisma.session.deleteMany();
    await prisma.challenge.deleteMany();
    await prisma.holder.deleteMany();
  });

  describe('POST /api/did', () => {
    it('should create a DID', async () => {
      const res = await request(app)
        .post('/api/did')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Wallet-Passphrase', passphrase)
        .send({})
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.didIdentifier).toMatch(/^did:example:[a-f0-9-]+$/);
      expect(res.body.createdAt).toBeDefined();
    });

    it('should create a DID with service', async () => {
      const res = await request(app)
        .post('/api/did')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Wallet-Passphrase', passphrase)
        .send({
          serviceName: 'LinkedDomains',
          serviceEndpoint: 'https://example.com'
        })
        .expect(201);

      expect(res.body.didIdentifier).toMatch(/^did:example:/);
    });

    it('should reject duplicate DID creation', async () => {
      // Create first DID
      await request(app)
        .post('/api/did')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Wallet-Passphrase', passphrase)
        .send({})
        .expect(201);

      // Try to create second DID
      const res = await request(app)
        .post('/api/did')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Wallet-Passphrase', passphrase)
        .send({})
        .expect(409);

      expect(res.body.error).toBe('Conflict');
      expect(res.body.message).toContain('already exists');
    });

    it('should reject without auth token', async () => {
      const res = await request(app)
        .post('/api/did')
        .set('X-Wallet-Passphrase', passphrase)
        .send({})
        .expect(401);

      expect(res.body.error).toBe('Unauthorized');
    });

    it('should reject without passphrase', async () => {
      const res = await request(app)
        .post('/api/did')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(400);

      expect(res.body.message).toContain('X-Wallet-Passphrase');
    });

    it('should reject short passphrase', async () => {
      const res = await request(app)
        .post('/api/did')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Wallet-Passphrase', 'short')
        .send({})
        .expect(400);

      expect(res.body.message).toContain('at least 8 characters');
    });
  });

  describe('GET /api/did', () => {
    beforeEach(async () => {
      // Create a DID first
      await request(app)
        .post('/api/did')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Wallet-Passphrase', passphrase)
        .send({})
        .expect(201);
    });

    it('should retrieve DID with correct passphrase', async () => {
      const res = await request(app)
        .get('/api/did')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Wallet-Passphrase', passphrase)
        .expect(200);

      expect(res.body.id).toBeDefined();
      expect(res.body.didIdentifier).toMatch(/^did:example:/);
      expect(res.body.document).toBeDefined();
      expect(res.body.document['@context']).toBeDefined();
      expect(res.body.document.verificationMethod).toBeDefined();
      expect(res.body.document.authentication).toBeDefined();
    });

    it('should fail with wrong passphrase', async () => {
      const res = await request(app)
        .get('/api/did')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Wallet-Passphrase', 'wrong-passphrase')
        .expect(403);

      expect(res.body.error).toBe('Forbidden');
      expect(res.body.message).toContain('Invalid passphrase');
    });

    it('should return 404 when no DID exists', async () => {
      // Create new holder without DID
      const newKeyPair = generateKeyPair();
      const newHolder = { holderId: uuidv4(), publicKey: newKeyPair.publicKey };
      await request(app).post('/api/auth/register').send(newHolder).expect(201);
      const challengeRes = await request(app).post('/api/auth/challenge').send({ holderId: newHolder.holderId }).expect(200);
      const signature = sign(challengeRes.body.nonce, newKeyPair.privateKey);
      const loginRes = await request(app).post('/api/auth/login').send({
        holderId: newHolder.holderId,
        challengeId: challengeRes.body.challengeId,
        signature
      }).expect(200);

      const res = await request(app)
        .get('/api/did')
        .set('Authorization', `Bearer ${loginRes.body.token}`)
        .set('X-Wallet-Passphrase', passphrase)
        .expect(404);

      expect(res.body.message).toContain('No DID found');
    });
  });
});
