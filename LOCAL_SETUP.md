# Local Setup

This guide prioritizes fast local reproducibility for reviewers, with no external services or manual setup steps.

Run the SSI Personal Data Wallet locally with a single command.

## Prerequisites

- **Docker** (20.10+)
- **Docker Compose** (v2+)

That's all. No Node.js, database, or other dependencies required.

## One-Command Start

```bash
docker compose up --build
```

This will:

1. Build the Node.js 20 Alpine image
2. Generate Prisma client
3. Run database migrations (SQLite)
4. Start the API server on port 3000

### Verify It's Running

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{ "status": "healthy", "timestamp": "2024-01-15T10:30:00.000Z" }
```

## Access Points

| URL                                  | Description                       |
| ------------------------------------ | --------------------------------- |
| `http://localhost:3000/docs`         | Swagger UI (interactive API docs) |
| `http://localhost:3000/openapi.json` | OpenAPI 3.0 specification         |
| `http://localhost:3000/metrics`      | Prometheus metrics                |
| `http://localhost:3000/health`       | Health check endpoint             |

## Running Tests

### With Docker (recommended)

```bash
docker compose run --rm ssi-wallet yarn test
```

### Without Docker (Optional)

Requires Node.js 20+ and Yarn:

```bash
# Install dependencies
yarn install

# Generate Prisma client
yarn prisma:generate

# Run migrations
DATABASE_URL="file:./data/wallet.db" yarn prisma:migrate:dev

# Run tests
yarn test
```

### Test Commands

| Command                 | Description             |
| ----------------------- | ----------------------- |
| `yarn test`             | All tests with coverage |
| `yarn test:unit`        | Unit tests only         |
| `yarn test:integration` | Integration tests only  |

## Environment Variables

| Variable                    | Default                 | Description          |
| --------------------------- | ----------------------- | -------------------- |
| `PORT`                      | `3000`                  | Server port          |
| `DATABASE_URL`              | `file:./data/wallet.db` | SQLite database path |
| `JWT_SECRET`                | (auto-generated in dev) | JWT signing secret   |
| `JWT_EXPIRES_IN`            | `1h`                    | Token expiration     |
| `CHALLENGE_EXPIRES_SECONDS` | `300`                   | Auth challenge TTL   |
| `LOG_LEVEL`                 | `info`                  | Pino log level       |
| `NODE_ENV`                  | `development`           | Environment mode     |

## Data Persistence

SQLite database is stored in a Docker volume (`wallet-data`). To reset:

```bash
docker compose down -v
docker compose up --build
```

## Troubleshooting

### Port Already in Use

```bash
# Find what's using port 3000
lsof -i :3000

# Use a different port
PORT=3001 docker compose up --build
```

### Database Locked

SQLite can lock if multiple processes access it. Ensure only one container is running:

```bash
docker compose down
docker compose up --build
```

### Prisma Migration Issues

Reset the database:

```bash
docker compose down -v
docker compose up --build
```

### Container Won't Start

Check logs:

```bash
docker compose logs -f ssi-wallet
```

### Tests Fail with "ECONNREFUSED"

Ensure you're running tests with the correct database URL:

```bash
DATABASE_URL="file:./data/test.db" yarn test
```
