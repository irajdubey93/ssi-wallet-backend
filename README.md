# SSI Personal Data Wallet

A minimal, security-first prototype for managing Decentralized Identifiers (DIDs) and Verifiable Credentials (VCs) with passwordless cryptographic authentication.

## What This Is

This project prioritizes correctness, security fundamentals, and local reproducibility over feature completeness.
Design decisions intentionally favor explicit trade-offs and simplicity so the system can be reasoned about, tested, and evolved incrementally.

- Single-holder personal data wallet
- Ed25519 challenge-response authentication (no passwords)
- AES-256-GCM encryption at rest for all sensitive data
- RESTful API with OpenAPI documentation
- SQLite persistence (zero external dependencies)

## What This Is Not

- A UI or frontend application
- Production-ready (see [Security Notes](#security-notes))
- Multi-tenant or multi-user
- Fully W3C DID/VC compliant
- Blockchain-integrated

## Quickstart

```bash
docker compose up --build
```

**That's it.** The API is available at `http://localhost:3000`.

| Endpoint                        | Description        |
| ------------------------------- | ------------------ |
| `http://localhost:3000/docs`    | Swagger UI         |
| `http://localhost:3000/metrics` | Prometheus metrics |
| `http://localhost:3000/health`  | Health check       |

## Documentation

- **[LOCAL_SETUP.md](LOCAL_SETUP.md)** — Prerequisites, environment, testing
- **[API_REFERENCE.md](API_REFERENCE.md)** — Complete endpoint documentation
- **[docs/ADR.md](docs/ADR.md)** — Architecture decisions and rationale

## Security Notes

This is a **prototype** with intentional simplifications:

- **Single-holder design**: No multi-tenancy or access control between users
- **Passphrase in header**: Accepted only for this prototype; production would require client-side encryption or HSM/KMS-backed envelope encryption
- **No key rotation**: DIDs and VCs use fixed encryption keys derived from passphrase
- **JWT without refresh**: Tokens expire after 1 hour with no rotation mechanism
- **SQLite**: Single-file database, not suitable for concurrent production workloads
- **did:example method**: Placeholder DID method, not resolvable externally
- **Simplified VC structure**: W3C-inspired but not fully compliant

**Production would require**: KMS/HSM integration, client-side encryption, key rotation, PostgreSQL, proper DID methods, and W3C compliance.

## Observability

### Structured Logging

JSON logs via Pino with automatic redaction of sensitive headers:

- `X-Wallet-Passphrase` is never logged
- Request correlation via `X-Request-ID` header
- Log levels: `error`, `warn`, `info`, `debug`

### Prometheus Metrics

Available at `/metrics`:

- `ssi_wallet_auth_challenges_total` — Challenge requests by status
- `ssi_wallet_auth_logins_total` — Login attempts by status
- `ssi_wallet_did_operations_total` — DID operations by type and status
- `ssi_wallet_vc_operations_total` — VC operations by type and status
- `ssi_wallet_http_requests_total` — HTTP requests by method, path, status
- `ssi_wallet_http_request_duration_seconds` — Request latency histogram

These signals are intended to make authentication failures, cryptographic errors, and credential lifecycle events observable during local testing and review.

## Testing

```bash
# Run all tests
yarn test

# Unit tests only
yarn test:unit

# Integration tests only
yarn test:integration
```

Coverage reports are generated in `coverage/`.

## License

MIT
