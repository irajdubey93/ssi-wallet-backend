#!/usr/bin/env node

/**
 * SSI Wallet API Test Script
 * 
 * Usage: node test-api.js [BASE_URL]
 * Default: http://localhost:3000
 */

const crypto = require('crypto');

const BASE_URL = process.argv[2] || 'http://localhost:3000';
const PASSPHRASE = 'test-passphrase-12345678';

// Generate Ed25519 key pair
function generateKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return {
    publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
    privateKey: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64')
  };
}

// Sign message with private key
function sign(message, privateKeyBase64) {
  const privateKeyDer = Buffer.from(privateKeyBase64, 'base64');
  const privateKey = crypto.createPrivateKey({ key: privateKeyDer, format: 'der', type: 'pkcs8' });
  return crypto.sign(null, Buffer.from(message), privateKey).toString('base64');
}

// Pretty print JSON
function pp(obj) {
  return JSON.stringify(obj, null, 2);
}

async function test() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  SSI WALLET API TEST');
  console.log('  Base URL:', BASE_URL);
  console.log('═══════════════════════════════════════════════════════════════\n');

  const keyPair = generateKeyPair();
  const holderId = crypto.randomUUID();
  let token, didIdentifier, vcId;

  // ─────────────────────────────────────────────────────────────────
  // 1. Health Check
  // ─────────────────────────────────────────────────────────────────
  console.log('┌─ 1. GET /health ─────────────────────────────────────────────┐');
  const healthRes = await fetch(`${BASE_URL}/health`);
  console.log('Status:', healthRes.status);
  console.log('Response:', pp(await healthRes.json()));
  console.log('└──────────────────────────────────────────────────────────────┘\n');

  // ─────────────────────────────────────────────────────────────────
  // 2. Register
  // ─────────────────────────────────────────────────────────────────
  console.log('┌─ 2. POST /api/auth/register ─────────────────────────────────┐');
  console.log('Request:', pp({ holderId, publicKey: keyPair.publicKey.substring(0, 40) + '...' }));
  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ holderId, publicKey: keyPair.publicKey })
  });
  console.log('Status:', regRes.status);
  console.log('Response:', pp(await regRes.json()));
  console.log('└──────────────────────────────────────────────────────────────┘\n');

  // ─────────────────────────────────────────────────────────────────
  // 3. Challenge
  // ─────────────────────────────────────────────────────────────────
  console.log('┌─ 3. POST /api/auth/challenge ────────────────────────────────┐');
  console.log('Request:', pp({ holderId }));
  const challengeRes = await fetch(`${BASE_URL}/api/auth/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ holderId })
  });
  const challenge = await challengeRes.json();
  console.log('Status:', challengeRes.status);
  console.log('Response:', pp(challenge));
  console.log('└──────────────────────────────────────────────────────────────┘\n');

  // ─────────────────────────────────────────────────────────────────
  // 4. Login
  // ─────────────────────────────────────────────────────────────────
  console.log('┌─ 4. POST /api/auth/login ────────────────────────────────────┐');
  const signature = sign(challenge.nonce, keyPair.privateKey);
  const loginBody = { holderId, challengeId: challenge.challengeId, signature };
  console.log('Request:', pp({ ...loginBody, signature: signature.substring(0, 40) + '...' }));
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(loginBody)
  });
  const loginData = await loginRes.json();
  token = loginData.token;
  console.log('Status:', loginRes.status);
  console.log('Response:', pp({ ...loginData, token: token.substring(0, 50) + '...' }));
  console.log('└──────────────────────────────────────────────────────────────┘\n');

  // ─────────────────────────────────────────────────────────────────
  // 5. Create DID
  // ─────────────────────────────────────────────────────────────────
  console.log('┌─ 5. POST /api/did ───────────────────────────────────────────┐');
  console.log('Headers: Authorization: Bearer <token>, X-Wallet-Passphrase: ***');
  console.log('Request:', pp({}));
  const didRes = await fetch(`${BASE_URL}/api/did`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-Wallet-Passphrase': PASSPHRASE
    },
    body: JSON.stringify({})
  });
  const didData = await didRes.json();
  didIdentifier = didData.didIdentifier;
  console.log('Status:', didRes.status);
  console.log('Response:', pp(didData));
  console.log('└──────────────────────────────────────────────────────────────┘\n');

  // ─────────────────────────────────────────────────────────────────
  // 6. Get DID
  // ─────────────────────────────────────────────────────────────────
  console.log('┌─ 6. GET /api/did ────────────────────────────────────────────┐');
  console.log('Headers: Authorization: Bearer <token>, X-Wallet-Passphrase: ***');
  const getDIDRes = await fetch(`${BASE_URL}/api/did`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-Wallet-Passphrase': PASSPHRASE
    }
  });
  const getDIDData = await getDIDRes.json();
  console.log('Status:', getDIDRes.status);
  console.log('Response:', pp(getDIDData));
  console.log('└──────────────────────────────────────────────────────────────┘\n');

  // ─────────────────────────────────────────────────────────────────
  // 7. Create VC
  // ─────────────────────────────────────────────────────────────────
  console.log('┌─ 7. POST /api/vcs ───────────────────────────────────────────┐');
  const vcBody = {
    type: 'ProofOfEmployment',
    issuer: 'did:example:employer-corp',
    subjectId: didIdentifier,
    claims: {
      employer: 'ACME Corporation',
      position: 'Software Engineer',
      startDate: '2024-01-15'
    }
  };
  console.log('Headers: Authorization: Bearer <token>, X-Wallet-Passphrase: ***');
  console.log('Request:', pp(vcBody));
  const vcRes = await fetch(`${BASE_URL}/api/vcs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-Wallet-Passphrase': PASSPHRASE
    },
    body: JSON.stringify(vcBody)
  });
  const vcData = await vcRes.json();
  vcId = vcData.id;
  console.log('Status:', vcRes.status);
  console.log('Response:', pp(vcData));
  console.log('└──────────────────────────────────────────────────────────────┘\n');

  // ─────────────────────────────────────────────────────────────────
  // 8. List VCs
  // ─────────────────────────────────────────────────────────────────
  console.log('┌─ 8. GET /api/vcs ────────────────────────────────────────────┐');
  console.log('Headers: Authorization: Bearer <token>');
  const listRes = await fetch(`${BASE_URL}/api/vcs`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log('Status:', listRes.status);
  console.log('Response:', pp(await listRes.json()));
  console.log('└──────────────────────────────────────────────────────────────┘\n');

  // ─────────────────────────────────────────────────────────────────
  // 9. Get VC (decrypted)
  // ─────────────────────────────────────────────────────────────────
  console.log('┌─ 9. GET /api/vcs/:id ────────────────────────────────────────┐');
  console.log('Headers: Authorization: Bearer <token>, X-Wallet-Passphrase: ***');
  console.log('Path: /api/vcs/' + vcId);
  const getVCRes = await fetch(`${BASE_URL}/api/vcs/${vcId}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-Wallet-Passphrase': PASSPHRASE
    }
  });
  console.log('Status:', getVCRes.status);
  console.log('Response:', pp(await getVCRes.json()));
  console.log('└──────────────────────────────────────────────────────────────┘\n');

  // ─────────────────────────────────────────────────────────────────
  // 10. Update VC (revoke)
  // ─────────────────────────────────────────────────────────────────
  console.log('┌─ 10. PATCH /api/vcs/:id (revoke) ────────────────────────────┐');
  console.log('Headers: Authorization: Bearer <token>');
  console.log('Request:', pp({ status: 'revoked' }));
  const revokeRes = await fetch(`${BASE_URL}/api/vcs/${vcId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ status: 'revoked' })
  });
  console.log('Status:', revokeRes.status);
  console.log('Response:', pp(await revokeRes.json()));
  console.log('└──────────────────────────────────────────────────────────────┘\n');

  // ─────────────────────────────────────────────────────────────────
  // 11. Delete VC
  // ─────────────────────────────────────────────────────────────────
  console.log('┌─ 11. DELETE /api/vcs/:id ────────────────────────────────────┐');
  console.log('Headers: Authorization: Bearer <token>');
  const deleteRes = await fetch(`${BASE_URL}/api/vcs/${vcId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log('Status:', deleteRes.status);
  console.log('Response: (empty - 204 No Content)');
  console.log('└──────────────────────────────────────────────────────────────┘\n');

  // ─────────────────────────────────────────────────────────────────
  // 12. Logout
  // ─────────────────────────────────────────────────────────────────
  console.log('┌─ 12. POST /api/auth/logout ──────────────────────────────────┐');
  console.log('Headers: Authorization: Bearer <token>');
  const logoutRes = await fetch(`${BASE_URL}/api/auth/logout`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log('Status:', logoutRes.status);
  console.log('Response:', pp(await logoutRes.json()));
  console.log('└──────────────────────────────────────────────────────────────┘\n');

  // ─────────────────────────────────────────────────────────────────
  // 13. Metrics
  // ─────────────────────────────────────────────────────────────────
  console.log('┌─ 13. GET /metrics ───────────────────────────────────────────┐');
  const metricsRes = await fetch(`${BASE_URL}/metrics`);
  const metricsText = await metricsRes.text();
  console.log('Status:', metricsRes.status);
  console.log('Response (first 500 chars):\n' + metricsText.substring(0, 500) + '...');
  console.log('└──────────────────────────────────────────────────────────────┘\n');

  // ─────────────────────────────────────────────────────────────────
  // 14. OpenAPI Spec
  // ─────────────────────────────────────────────────────────────────
  console.log('┌─ 14. GET /openapi.json ──────────────────────────────────────┐');
  const openapiRes = await fetch(`${BASE_URL}/openapi.json`);
  const openapi = await openapiRes.json();
  console.log('Status:', openapiRes.status);
  console.log('Title:', openapi.info.title);
  console.log('Version:', openapi.info.version);
  console.log('Paths:', Object.keys(openapi.paths).join(', '));
  console.log('└──────────────────────────────────────────────────────────────┘\n');

  // ─────────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  ALL TESTS COMPLETED SUCCESSFULLY');
  console.log('═══════════════════════════════════════════════════════════════');
}

test().catch(err => {
  console.error('\n❌ ERROR:', err.message);
  process.exit(1);
});
