const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
const app = require('../../index');
const { generateKeyPair, sign } = require('../../utils/encryption');
const { prisma } = require('../setup');

describe('Authentication Integration Tests', () => {
  let testHolder;
  let keyPair;

  beforeEach(() => {
    keyPair = generateKeyPair();
    testHolder = {
      holderId: uuidv4(),
      publicKey: keyPair.publicKey
    };
  });

  afterEach(async () => {
    // Clean up test data
    await prisma.session.deleteMany();
    await prisma.challenge.deleteMany();
    await prisma.holder.deleteMany();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new holder', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send(testHolder)
        .expect(201);

      expect(res.body.message).toBe('Registration successful');
      expect(res.body.holderId).toBe(testHolder.holderId);
      expect(res.body.createdAt).toBeDefined();
    });

    it('should reject duplicate holder ID', async () => {
      await request(app)
        .post('/api/auth/register')
        .send(testHolder)
        .expect(201);

      const res = await request(app)
        .post('/api/auth/register')
        .send(testHolder)
        .expect(409);

      expect(res.body.error).toBe('Conflict');
    });

    it('should reject duplicate public key', async () => {
      await request(app)
        .post('/api/auth/register')
        .send(testHolder)
        .expect(201);

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          holderId: uuidv4(),
          publicKey: testHolder.publicKey
        })
        .expect(409);

      expect(res.body.error).toBe('Conflict');
      expect(res.body.message).toContain('Public key');
    });

    it('should reject invalid holder ID format', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          holderId: 'not-a-uuid',
          publicKey: keyPair.publicKey
        })
        .expect(400);

      expect(res.body.error).toBe('Validation Error');
    });

    it('should reject missing public key', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          holderId: uuidv4()
        })
        .expect(400);

      expect(res.body.error).toBe('Validation Error');
    });
  });

  describe('POST /api/auth/challenge', () => {
    beforeEach(async () => {
      await request(app)
        .post('/api/auth/register')
        .send(testHolder)
        .expect(201);
    });

    it('should issue a challenge for registered holder', async () => {
      const res = await request(app)
        .post('/api/auth/challenge')
        .send({ holderId: testHolder.holderId })
        .expect(200);

      expect(res.body.challengeId).toBeDefined();
      expect(res.body.nonce).toBeDefined();
      expect(res.body.expiresAt).toBeDefined();
      
      // Verify nonce is valid base64
      expect(() => Buffer.from(res.body.nonce, 'base64')).not.toThrow();
    });

    it('should return 404 for unregistered holder', async () => {
      const res = await request(app)
        .post('/api/auth/challenge')
        .send({ holderId: uuidv4() })
        .expect(404);

      expect(res.body.error).toBe('Not Found');
    });

    it('should issue unique nonces', async () => {
      const res1 = await request(app)
        .post('/api/auth/challenge')
        .send({ holderId: testHolder.holderId })
        .expect(200);

      const res2 = await request(app)
        .post('/api/auth/challenge')
        .send({ holderId: testHolder.holderId })
        .expect(200);

      expect(res1.body.nonce).not.toBe(res2.body.nonce);
    });
  });

  describe('POST /api/auth/login', () => {
    let challenge;

    beforeEach(async () => {
      await request(app)
        .post('/api/auth/register')
        .send(testHolder)
        .expect(201);

      const challengeRes = await request(app)
        .post('/api/auth/challenge')
        .send({ holderId: testHolder.holderId })
        .expect(200);

      challenge = challengeRes.body;
    });

    it('should login with valid signature', async () => {
      const signature = sign(challenge.nonce, keyPair.privateKey);

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          holderId: testHolder.holderId,
          challengeId: challenge.challengeId,
          signature
        })
        .expect(200);

      expect(res.body.token).toBeDefined();
      expect(res.body.expiresAt).toBeDefined();
      expect(res.body.holderId).toBe(testHolder.holderId);
    });

    it('should reject invalid signature', async () => {
      const wrongKeyPair = generateKeyPair();
      const signature = sign(challenge.nonce, wrongKeyPair.privateKey);

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          holderId: testHolder.holderId,
          challengeId: challenge.challengeId,
          signature
        })
        .expect(401);

      expect(res.body.error).toBe('Unauthorized');
      expect(res.body.message).toContain('Invalid signature');
    });

    it('should reject reused challenge', async () => {
      const signature = sign(challenge.nonce, keyPair.privateKey);

      // First login
      await request(app)
        .post('/api/auth/login')
        .send({
          holderId: testHolder.holderId,
          challengeId: challenge.challengeId,
          signature
        })
        .expect(200);

      // Second login with same challenge
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          holderId: testHolder.holderId,
          challengeId: challenge.challengeId,
          signature
        })
        .expect(401);

      expect(res.body.message).toContain('already used');
    });

    it('should reject challenge from different holder', async () => {
      // Create another holder
      const otherKeyPair = generateKeyPair();
      const otherHolder = {
        holderId: uuidv4(),
        publicKey: otherKeyPair.publicKey
      };
      await request(app)
        .post('/api/auth/register')
        .send(otherHolder)
        .expect(201);

      // Try to use original challenge with other holder
      const signature = sign(challenge.nonce, otherKeyPair.privateKey);

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          holderId: otherHolder.holderId,
          challengeId: challenge.challengeId,
          signature
        })
        .expect(401);

      expect(res.body.message).toContain('does not belong');
    });

    it('should reject invalid challenge ID', async () => {
      const signature = sign(challenge.nonce, keyPair.privateKey);

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          holderId: testHolder.holderId,
          challengeId: uuidv4(),
          signature
        })
        .expect(401);

      expect(res.body.message).toContain('Invalid challenge');
    });
  });

  describe('Full Authentication Flow', () => {
    it('should complete register -> challenge -> login -> use token', async () => {
      // 1. Register
      await request(app)
        .post('/api/auth/register')
        .send(testHolder)
        .expect(201);

      // 2. Request challenge
      const challengeRes = await request(app)
        .post('/api/auth/challenge')
        .send({ holderId: testHolder.holderId })
        .expect(200);

      // 3. Sign and login
      const signature = sign(challengeRes.body.nonce, keyPair.privateKey);
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          holderId: testHolder.holderId,
          challengeId: challengeRes.body.challengeId,
          signature
        })
        .expect(200);

      const token = loginRes.body.token;

      // 4. Use token for authenticated request (list VCs)
      const vcsRes = await request(app)
        .get('/api/vcs')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(vcsRes.body.data).toBeDefined();
      expect(vcsRes.body.pagination).toBeDefined();
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should logout successfully', async () => {
      // Register and login
      await request(app).post('/api/auth/register').send(testHolder).expect(201);
      const challengeRes = await request(app).post('/api/auth/challenge').send({ holderId: testHolder.holderId }).expect(200);
      const signature = sign(challengeRes.body.nonce, keyPair.privateKey);
      const loginRes = await request(app).post('/api/auth/login').send({
        holderId: testHolder.holderId,
        challengeId: challengeRes.body.challengeId,
        signature
      }).expect(200);

      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${loginRes.body.token}`)
        .expect(200);

      expect(res.body.message).toBe('Logged out');
    });

    it('should handle logout without token', async () => {
      const res = await request(app)
        .post('/api/auth/logout')
        .expect(200);

      expect(res.body.message).toBe('Logged out');
    });
  });
});
