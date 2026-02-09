# Architecture Decision Record

This document explains the key architectural decisions for the SSI Personal Data Wallet prototype.

---

## 1. Passwordless Challenge-Response Authentication

### Decision

Implement Ed25519 cryptographic challenge-response instead of username/password.

### Context

Traditional password authentication has well-known vulnerabilities: credential stuffing, password reuse, phishing, and the need to securely hash and store passwords. For a self-sovereign identity wallet, users should control cryptographic keys, not memorize passwords.

### Rationale

- **No password storage**: Eliminates credential stuffing and database breach risks
- **SSI alignment**: Users already manage key pairs for DID operations
- **Phishing resistance**: Signatures are bound to specific nonces with short TTLs
- **Replay protection**: Each nonce can only be used once

### Flow

```
Client                                    Server
  │                                          │
  ├─── POST /auth/register ─────────────────►│  Store publicKey + holderId
  │    {holderId, publicKey}                 │
  │                                          │
  ├─── POST /auth/challenge ────────────────►│  Generate nonce (5 min TTL)
  │    {holderId}                            │
  │◄──────────────────────────── {nonce} ────┤
  │                                          │
  │  sign(nonce, privateKey)                 │
  │                                          │
  ├─── POST /auth/login ────────────────────►│  Verify signature
  │    {holderId, challengeId, signature}    │  Mark nonce as used
  │◄──────────────────────────── {token} ────┤  Issue JWT
```

### Threat Model

| Threat | Mitigation |
|--------|------------|
| Stolen nonce | 5-minute expiration, single use |
| Replay attack | Nonce marked as used after verification |
| Man-in-the-middle | HTTPS required in production |
| Key compromise | Out of scope for prototype; production needs rotation |

### Trade-offs

- Requires client-side key management
- Lost private key = lost access (no recovery mechanism in prototype)

### Production Evolution

- Add key rotation endpoints
- Implement backup/recovery (social recovery, HSM backup)
- Support WebAuthn/FIDO2 for browser clients
- Add rate limiting on challenge requests

---

## 2. Encryption at Rest

### Decision

Encrypt DID Documents and VC payloads using AES-256-GCM with keys derived from client-provided passphrases via scrypt.

### Context

Sensitive identity data must be protected at rest. The prototype needs demonstrable encryption without external dependencies like KMS.

### Implementation

```
Passphrase (X-Wallet-Passphrase header)
    │
    ▼
scrypt(passphrase, per-holder-salt)  ──►  Data Encryption Key (DEK)
    │                                           │
    │                                           ▼
    │                                    AES-256-GCM encrypt
    │                                           │
    │                                           ▼
    │                                    {ciphertext, iv, authTag}
    │                                           │
    └───────────────────────────────────────────┴──►  Store in SQLite
```

**Parameters**:
- **scrypt**: N=16384, r=8, p=1 (OWASP recommended)
- **AES-256-GCM**: 12-byte IV, 16-byte auth tag
- **Salt**: 32 bytes, unique per holder, stored in database

### Security Properties

- **Confidentiality**: AES-256-GCM provides authenticated encryption
- **Integrity**: GCM auth tag detects tampering
- **Key isolation**: Per-holder salt ensures unique DEKs even with same passphrase
- **No secret storage**: Server never persists passphrase or DEK

### What's NOT Logged

The logger redacts:
- `X-Wallet-Passphrase` header
- Derived keys
- Decrypted payloads

### Trade-offs

- Passphrase required for every encrypt/decrypt operation
- Server transiently holds passphrase in memory during request
- No key rotation in prototype

### Production Evolution

| Prototype | Production |
|-----------|------------|
| Passphrase in header | Client-side encryption |
| Server-side key derivation | KMS-managed keys |
| No rotation | Key rotation with re-encryption |
| Single DEK per holder | Envelope encryption (KEK → DEK) |
| Memory-held passphrase | HSM for key operations |

---

## 3. SQLite Database

### Decision

Use SQLite as the persistence layer.

### Context

The prototype must run locally with a single `docker compose up` command. External database services add complexity.

### Rationale

- **Zero configuration**: File-based, no connection strings or service dependencies
- **One-command setup**: Database created automatically on first migration
- **Sufficient for prototype**: Single-holder wallet doesn't need distributed database
- **Portability**: Entire database is one file, easy to backup/inspect

### Schema

```
holders
├── id (PK)
├── publicKey (unique)
├── salt
└── timestamps

challenges
├── id (PK)
├── holderId (FK)
├── nonce (unique)
├── expiresAt
├── used
└── createdAt

sessions
├── id (PK)
├── holderId (FK)
├── token (unique)
├── expiresAt
└── createdAt

dids
├── id (PK)
├── holderId (FK)
├── didIdentifier (unique)
├── documentCipher
├── iv, authTag
└── timestamps

verifiable_credentials
├── id (PK)
├── holderId (FK)
├── type, issuer, subjectId
├── status
├── credentialCipher
├── iv, authTag
└── timestamps
```

### Trade-offs

- No concurrent write scaling
- Single-file limits practical dataset size
- Not suitable for multi-user production

### Production Evolution

Migrate to PostgreSQL:
- Multi-user support with proper isolation
- Concurrent access without locking issues
- Connection pooling (PgBouncer)
- Replication for high availability
- Better query optimization

---

## 4. Simplified DID and VC Structures

### Decision

Implement W3C-inspired but simplified DID Documents and Verifiable Credentials.

### Context

Full W3C compliance requires JSON-LD processing, cryptographic proofs, DID resolution, and extensive validation. This is out of scope for a prototype.

### What We Implement

**DID Document**:
```json
{
  "@context": ["https://www.w3.org/ns/did/v1"],
  "id": "did:example:<uuid>",
  "verificationMethod": [{
    "id": "did:example:<uuid>#key-1",
    "type": "Ed25519VerificationKey2020",
    "controller": "did:example:<uuid>",
    "publicKeyBase64": "<holder-public-key>"
  }],
  "authentication": ["did:example:<uuid>#key-1"]
}
```

**Verifiable Credential**:
```json
{
  "@context": ["https://www.w3.org/2018/credentials/v1"],
  "type": ["VerifiableCredential", "<custom-type>"],
  "issuer": "<issuer-did>",
  "credentialSubject": {
    "id": "<subject-did>",
    "<claim>": "<value>"
  }
}
```

### What We Don't Implement

- JSON-LD context resolution
- Cryptographic proofs (LD-Proofs, BBS+)
- DID resolution via Universal Resolver
- Verifiable Presentations
- Revocation registries

### Production Evolution

- Full W3C DID Core 1.0 compliance
- W3C Verifiable Credentials Data Model 2.0
- Support for real DID methods (did:web, did:key, did:ion)
- JSON-LD processing with proper context handling
- Cryptographic proofs for VC verification
- Integration with DID resolvers

---

## 5. JWT Session Tokens

### Decision

Use short-lived JWT tokens (1 hour) for session management after challenge-response authentication.

### Context

After successful authentication, subsequent API calls need a simpler mechanism than re-signing challenges.

### Implementation

- **Algorithm**: HS256 (symmetric)
- **Expiration**: 1 hour (configurable via `JWT_EXPIRES_IN`)
- **Payload**: `{holderId, sessionId}`
- **Session record**: Stored in database for optional revocation

### Trade-offs

- Cannot immediately revoke until expiry (stateless verification)
- Token in every request adds overhead
- HS256 requires shared secret (not suitable for distributed verification)

### Production Evolution

- Use RS256 (asymmetric) for distributed verification
- Implement refresh token rotation
- Add token revocation (blacklist or session store check)
- Consider opaque tokens with introspection endpoint
- Shorter access token TTL with refresh mechanism

---

## Summary

| Aspect | Prototype Choice | Production Path |
|--------|------------------|-----------------|
| **Auth** | Ed25519 challenge-response | + WebAuthn, key rotation, recovery |
| **Encryption** | Passphrase → scrypt → AES-GCM | KMS/HSM, client-side encryption |
| **Database** | SQLite | PostgreSQL with HA |
| **DID/VC** | Simplified W3C-inspired | Full W3C compliance |
| **Tenancy** | Single-holder | Multi-tenant with RBAC |
| **Sessions** | JWT (1h, HS256) | RS256 + refresh + revocation |

---

## References

- [W3C DID Core 1.0](https://www.w3.org/TR/did-core/)
- [W3C Verifiable Credentials Data Model](https://www.w3.org/TR/vc-data-model/)
- [Ed25519 Specification](https://ed25519.cr.yp.to/)
- [AES-GCM (NIST SP 800-38D)](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-38d.pdf)
- [scrypt (RFC 7914)](https://www.rfc-editor.org/rfc/rfc7914)
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
