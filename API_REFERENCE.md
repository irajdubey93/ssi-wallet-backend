# API Reference

Complete endpoint documentation for the SSI Personal Data Wallet API.

**Base URL**: `http://localhost:3000/api`

---

## Authentication

All endpoints except registration and challenge require a JWT token in the `Authorization` header:

```
Authorization: Bearer <token>
```

Endpoints that access encrypted data also require:

```
X-Wallet-Passphrase: <your-passphrase>
```

---

## Endpoints

### POST /auth/register

Register a new wallet holder with an Ed25519 public key.

**Auth Required**: No

**Request**:
```json
{
  "holderId": "550e8400-e29b-41d4-a716-446655440000",
  "publicKey": "MCowBQYDK2VwAyEA..."
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `holderId` | UUID | Yes | Client-generated unique identifier |
| `publicKey` | string | Yes | Base64-encoded Ed25519 public key (DER SPKI format) |

**Response** (201):
```json
{
  "message": "Registration successful",
  "holderId": "550e8400-e29b-41d4-a716-446655440000",
  "createdAt": "2024-01-15T10:30:00.000Z"
}
```

**Errors**:
| Status | Error | When |
|--------|-------|------|
| 400 | Validation Error | Invalid UUID or public key format |
| 409 | Conflict | Holder ID or public key already registered |

---

### POST /auth/challenge

Request a nonce for passwordless authentication.

**Auth Required**: No

**Request**:
```json
{
  "holderId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response** (200):
```json
{
  "challengeId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "nonce": "dGVzdC1ub25jZS1iYXNlNjQ=",
  "expiresAt": "2024-01-15T10:35:00.000Z"
}
```

**Errors**:
| Status | Error | When |
|--------|-------|------|
| 404 | Not Found | Holder not registered |

---

### POST /auth/login

Submit signed nonce to receive JWT token.

**Auth Required**: No

**Request**:
```json
{
  "holderId": "550e8400-e29b-41d4-a716-446655440000",
  "challengeId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "signature": "c2lnbmF0dXJlLWJhc2U2NA=="
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `holderId` | UUID | Yes | Holder identifier |
| `challengeId` | UUID | Yes | Challenge ID from /auth/challenge |
| `signature` | string | Yes | Base64-encoded Ed25519 signature of the nonce |

**Response** (200):
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresAt": "2024-01-15T11:30:00.000Z",
  "holderId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Errors**:
| Status | Error | When |
|--------|-------|------|
| 401 | Unauthorized | Invalid challenge, expired, already used, or invalid signature |

---

### POST /auth/logout

Invalidate current session.

**Auth Required**: Optional (succeeds regardless)

**Response** (200):
```json
{
  "message": "Logged out"
}
```

---

### POST /did

Create a DID for the authenticated holder.

**Auth Required**: Yes  
**Passphrase Required**: Yes

**Request**:
```json
{
  "serviceName": "LinkedDomains",
  "serviceEndpoint": "https://example.com"
}
```

All fields are optional. An empty `{}` body is valid.

**Response** (201):
```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "didIdentifier": "did:example:550e8400-e29b-41d4-a716-446655440000",
  "createdAt": "2024-01-15T10:30:00.000Z"
}
```

**Errors**:
| Status | Error | When |
|--------|-------|------|
| 400 | Bad Request | Missing or invalid passphrase (min 8 chars) |
| 401 | Unauthorized | Missing or invalid token |
| 409 | Conflict | DID already exists for this holder |

---

### GET /did

Retrieve holder's DID document (decrypted).

**Auth Required**: Yes  
**Passphrase Required**: Yes

**Response** (200):
```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "didIdentifier": "did:example:550e8400-e29b-41d4-a716-446655440000",
  "document": {
    "@context": ["https://www.w3.org/ns/did/v1"],
    "id": "did:example:550e8400-e29b-41d4-a716-446655440000",
    "verificationMethod": [...],
    "authentication": [...]
  },
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:30:00.000Z"
}
```

**Errors**:
| Status | Error | When |
|--------|-------|------|
| 401 | Unauthorized | Missing or invalid token |
| 403 | Forbidden | Wrong passphrase (decryption failed) |
| 404 | Not Found | No DID exists for holder |

---

### POST /vcs

Create a Verifiable Credential.

**Auth Required**: Yes  
**Passphrase Required**: Yes

**Request**:
```json
{
  "type": "ProofOfEmployment",
  "issuer": "did:example:issuer123",
  "subjectId": "did:example:subject456",
  "issuedAt": "2024-01-15T10:30:00.000Z",
  "expiresAt": "2025-01-15T10:30:00.000Z",
  "claims": {
    "employer": "ACME Corporation",
    "position": "Software Engineer",
    "startDate": "2023-01-15"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | Credential type (e.g., ProofOfEmployment) |
| `issuer` | string | Yes | Issuer DID or identifier |
| `subjectId` | string | Yes | Subject DID |
| `issuedAt` | ISO8601 | No | Issuance date (defaults to now) |
| `expiresAt` | ISO8601 | No | Expiration date |
| `claims` | object | No | Arbitrary claims object |

**Response** (201):
```json
{
  "id": "b2c3d4e5-f6a7-8901-bcde-f23456789012",
  "type": "ProofOfEmployment",
  "issuer": "did:example:issuer123",
  "subjectId": "did:example:subject456",
  "status": "active",
  "issuedAt": "2024-01-15T10:30:00.000Z",
  "expiresAt": "2025-01-15T10:30:00.000Z",
  "createdAt": "2024-01-15T10:30:00.000Z"
}
```

**Errors**:
| Status | Error | When |
|--------|-------|------|
| 400 | Validation Error | Missing required fields or invalid format |
| 401 | Unauthorized | Missing or invalid token |

---

### GET /vcs

List VCs (metadata only, no decryption).

**Auth Required**: Yes  
**Passphrase Required**: No

**Query Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | 1 | Page number |
| `limit` | integer | 20 | Items per page (max 100) |
| `type` | string | — | Filter by VC type |
| `status` | string | — | Filter by status: `active`, `revoked`, `expired` |

**Response** (200):
```json
{
  "data": [
    {
      "id": "b2c3d4e5-f6a7-8901-bcde-f23456789012",
      "type": "ProofOfEmployment",
      "issuer": "did:example:issuer123",
      "subjectId": "did:example:subject456",
      "status": "active",
      "issuedAt": "2024-01-15T10:30:00.000Z",
      "expiresAt": "2025-01-15T10:30:00.000Z",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

---

### GET /vcs/:id

Get single VC with decrypted payload.

**Auth Required**: Yes  
**Passphrase Required**: Yes

**Response** (200):
```json
{
  "id": "b2c3d4e5-f6a7-8901-bcde-f23456789012",
  "type": "ProofOfEmployment",
  "issuer": "did:example:issuer123",
  "subjectId": "did:example:subject456",
  "status": "active",
  "issuedAt": "2024-01-15T10:30:00.000Z",
  "expiresAt": "2025-01-15T10:30:00.000Z",
  "credential": {
    "@context": ["https://www.w3.org/2018/credentials/v1"],
    "type": ["VerifiableCredential", "ProofOfEmployment"],
    "issuer": "did:example:issuer123",
    "credentialSubject": {
      "id": "did:example:subject456",
      "employer": "ACME Corporation",
      "position": "Software Engineer"
    }
  },
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:30:00.000Z"
}
```

**Errors**:
| Status | Error | When |
|--------|-------|------|
| 401 | Unauthorized | Missing or invalid token |
| 403 | Forbidden | Wrong passphrase |
| 404 | Not Found | VC not found or belongs to another holder |

---

### PATCH /vcs/:id

Update VC status (e.g., revoke).

**Auth Required**: Yes  
**Passphrase Required**: No

**Request**:
```json
{
  "status": "revoked"
}
```

| Value | Description |
|-------|-------------|
| `active` | VC is valid |
| `revoked` | VC has been revoked |
| `expired` | VC has expired |

**Response** (200):
```json
{
  "id": "b2c3d4e5-f6a7-8901-bcde-f23456789012",
  "type": "ProofOfEmployment",
  "issuer": "did:example:issuer123",
  "subjectId": "did:example:subject456",
  "status": "revoked",
  "issuedAt": "2024-01-15T10:30:00.000Z",
  "expiresAt": "2025-01-15T10:30:00.000Z",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:35:00.000Z"
}
```

**Errors**:
| Status | Error | When |
|--------|-------|------|
| 400 | Validation Error | Invalid status value |
| 401 | Unauthorized | Missing or invalid token |
| 404 | Not Found | VC not found |

---

### DELETE /vcs/:id

Delete a VC permanently.

**Auth Required**: Yes  
**Passphrase Required**: No

**Response** (204): No content

**Errors**:
| Status | Error | When |
|--------|-------|------|
| 401 | Unauthorized | Missing or invalid token |
| 404 | Not Found | VC not found |

---

## Error Response Format

All errors follow this structure:

```json
{
  "error": "Error Type",
  "message": "Human-readable description",
  "requestId": "correlation-id"
}
```

Validation errors include details:

```json
{
  "error": "Validation Error",
  "message": "Invalid request body",
  "details": [
    {"path": "holderId", "message": "Invalid uuid"}
  ]
}
```

---

## HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 204 | No Content (successful deletion) |
| 400 | Bad Request (validation error) |
| 401 | Unauthorized (missing/invalid token or challenge) |
| 403 | Forbidden (wrong passphrase) |
| 404 | Not Found |
| 409 | Conflict (duplicate resource) |
| 500 | Internal Server Error |
