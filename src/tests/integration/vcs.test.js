const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
const app = require('../../index');
const { generateKeyPair, sign } = require('../../utils/encryption');
const { prisma } = require('../setup');

describe('Verifiable Credentials Integration Tests', () => {
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
    const sig = sign(challengeRes.body.nonce, keyPair.privateKey);
    const loginRes = await request(app).post('/api/auth/login').send({
      holderId: testHolder.holderId,
      challengeId: challengeRes.body.challengeId,
      signature: sig
    }).expect(200);
    authToken = loginRes.body.token;
  });

  afterEach(async () => {
    await prisma.verifiableCredential.deleteMany();
    await prisma.dID.deleteMany();
    await prisma.session.deleteMany();
    await prisma.challenge.deleteMany();
    await prisma.holder.deleteMany();
  });

  const sampleVC = {
    type: 'ProofOfEmployment',
    issuer: 'did:example:issuer123',
    subjectId: 'did:example:subject456',
    claims: {
      employer: 'ACME Corporation',
      position: 'Software Engineer',
      startDate: '2023-01-15'
    }
  };

  describe('POST /api/vcs', () => {
    it('should create a VC', async () => {
      const res = await request(app)
        .post('/api/vcs')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Wallet-Passphrase', passphrase)
        .send(sampleVC)
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.type).toBe('ProofOfEmployment');
      expect(res.body.issuer).toBe('did:example:issuer123');
      expect(res.body.subjectId).toBe('did:example:subject456');
      expect(res.body.status).toBe('active');
      expect(res.body.createdAt).toBeDefined();
    });

    it('should create multiple VCs', async () => {
      // Create first VC
      await request(app)
        .post('/api/vcs')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Wallet-Passphrase', passphrase)
        .send(sampleVC)
        .expect(201);

      // Create second VC
      const res = await request(app)
        .post('/api/vcs')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Wallet-Passphrase', passphrase)
        .send({
          ...sampleVC,
          type: 'ProofOfEducation',
          claims: { degree: 'BS Computer Science' }
        })
        .expect(201);

      expect(res.body.type).toBe('ProofOfEducation');
    });

    it('should reject VC without required fields', async () => {
      const res = await request(app)
        .post('/api/vcs')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Wallet-Passphrase', passphrase)
        .send({ type: 'Test' }) // Missing issuer and subjectId
        .expect(400);

      expect(res.body.error).toBe('Validation Error');
    });

    it('should reject without auth', async () => {
      await request(app)
        .post('/api/vcs')
        .set('X-Wallet-Passphrase', passphrase)
        .send(sampleVC)
        .expect(401);
    });
  });

  describe('GET /api/vcs', () => {
    beforeEach(async () => {
      // Create some VCs
      await request(app)
        .post('/api/vcs')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Wallet-Passphrase', passphrase)
        .send(sampleVC)
        .expect(201);

      await request(app)
        .post('/api/vcs')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Wallet-Passphrase', passphrase)
        .send({ ...sampleVC, type: 'ProofOfEducation' })
        .expect(201);
    });

    it('should list VCs (metadata only)', async () => {
      const res = await request(app)
        .get('/api/vcs')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.data).toHaveLength(2);
      expect(res.body.pagination).toBeDefined();
      expect(res.body.pagination.total).toBe(2);
      
      // Should NOT include decrypted credential
      expect(res.body.data[0].credential).toBeUndefined();
    });

    it('should filter by type', async () => {
      const res = await request(app)
        .get('/api/vcs?type=ProofOfEmployment')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].type).toBe('ProofOfEmployment');
    });

    it('should filter by status', async () => {
      const res = await request(app)
        .get('/api/vcs?status=active')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.data).toHaveLength(2);
    });

    it('should paginate results', async () => {
      const res = await request(app)
        .get('/api/vcs?page=1&limit=1')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.limit).toBe(1);
      expect(res.body.pagination.totalPages).toBe(2);
    });
  });

  describe('GET /api/vcs/:id', () => {
    let vcId;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/vcs')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Wallet-Passphrase', passphrase)
        .send(sampleVC)
        .expect(201);
      vcId = res.body.id;
    });

    it('should get VC with decrypted payload', async () => {
      const res = await request(app)
        .get(`/api/vcs/${vcId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Wallet-Passphrase', passphrase)
        .expect(200);

      expect(res.body.id).toBe(vcId);
      expect(res.body.credential).toBeDefined();
      expect(res.body.credential['@context']).toBeDefined();
      expect(res.body.credential.credentialSubject).toBeDefined();
      expect(res.body.credential.credentialSubject.employer).toBe('ACME Corporation');
    });

    it('should fail with wrong passphrase', async () => {
      const res = await request(app)
        .get(`/api/vcs/${vcId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Wallet-Passphrase', 'wrong-passphrase')
        .expect(403);

      expect(res.body.message).toContain('Invalid passphrase');
    });

    it('should return 404 for non-existent VC', async () => {
      const res = await request(app)
        .get(`/api/vcs/${uuidv4()}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Wallet-Passphrase', passphrase)
        .expect(404);

      expect(res.body.error).toBe('Not Found');
    });
  });

  describe('PATCH /api/vcs/:id', () => {
    let vcId;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/vcs')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Wallet-Passphrase', passphrase)
        .send(sampleVC)
        .expect(201);
      vcId = res.body.id;
    });

    it('should update VC status to revoked', async () => {
      const res = await request(app)
        .patch(`/api/vcs/${vcId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'revoked' })
        .expect(200);

      expect(res.body.status).toBe('revoked');
    });

    it('should update VC status to expired', async () => {
      const res = await request(app)
        .patch(`/api/vcs/${vcId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'expired' })
        .expect(200);

      expect(res.body.status).toBe('expired');
    });

    it('should reject invalid status', async () => {
      const res = await request(app)
        .patch(`/api/vcs/${vcId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'invalid' })
        .expect(400);

      expect(res.body.error).toBe('Validation Error');
    });

    it('should return 404 for non-existent VC', async () => {
      await request(app)
        .patch(`/api/vcs/${uuidv4()}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'revoked' })
        .expect(404);
    });
  });

  describe('DELETE /api/vcs/:id', () => {
    let vcId;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/vcs')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Wallet-Passphrase', passphrase)
        .send(sampleVC)
        .expect(201);
      vcId = res.body.id;
    });

    it('should delete VC', async () => {
      await request(app)
        .delete(`/api/vcs/${vcId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(204);

      // Verify deleted
      await request(app)
        .get(`/api/vcs/${vcId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Wallet-Passphrase', passphrase)
        .expect(404);
    });

    it('should return 404 for non-existent VC', async () => {
      await request(app)
        .delete(`/api/vcs/${uuidv4()}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    it('should not allow deleting other holder\'s VC', async () => {
      // Create another holder
      const otherKeyPair = generateKeyPair();
      const otherHolder = { holderId: uuidv4(), publicKey: otherKeyPair.publicKey };
      await request(app).post('/api/auth/register').send(otherHolder).expect(201);
      const challengeRes = await request(app).post('/api/auth/challenge').send({ holderId: otherHolder.holderId }).expect(200);
      const sig = sign(challengeRes.body.nonce, otherKeyPair.privateKey);
      const loginRes = await request(app).post('/api/auth/login').send({
        holderId: otherHolder.holderId,
        challengeId: challengeRes.body.challengeId,
        signature: sig
      }).expect(200);

      // Try to delete original holder's VC
      await request(app)
        .delete(`/api/vcs/${vcId}`)
        .set('Authorization', `Bearer ${loginRes.body.token}`)
        .expect(404);
    });
  });

  describe('Full VC CRUD Flow', () => {
    it('should complete create -> read -> update -> delete', async () => {
      // Create
      const createRes = await request(app)
        .post('/api/vcs')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Wallet-Passphrase', passphrase)
        .send(sampleVC)
        .expect(201);

      const vcId = createRes.body.id;
      expect(createRes.body.status).toBe('active');

      // Read (list)
      const listRes = await request(app)
        .get('/api/vcs')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(listRes.body.data.some(vc => vc.id === vcId)).toBe(true);

      // Read (single with decryption)
      const readRes = await request(app)
        .get(`/api/vcs/${vcId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Wallet-Passphrase', passphrase)
        .expect(200);

      expect(readRes.body.credential.credentialSubject.employer).toBe('ACME Corporation');

      // Update (revoke)
      const updateRes = await request(app)
        .patch(`/api/vcs/${vcId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'revoked' })
        .expect(200);

      expect(updateRes.body.status).toBe('revoked');

      // Verify status in list
      const listRes2 = await request(app)
        .get('/api/vcs?status=revoked')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(listRes2.body.data.some(vc => vc.id === vcId)).toBe(true);

      // Delete
      await request(app)
        .delete(`/api/vcs/${vcId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(204);

      // Verify deleted
      const finalList = await request(app)
        .get('/api/vcs')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(finalList.body.data.some(vc => vc.id === vcId)).toBe(false);
    });
  });
});
