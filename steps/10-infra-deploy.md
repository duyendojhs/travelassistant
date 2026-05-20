# Step 10 - Infrastructure And Deployment

## Goal

Prepare Docker, local integration, and low-cost public launch deployment.

## Required Services Before Production-Like Test

For local Docker:

- PostgreSQL.
- Redis.
- Qdrant.
- Optional MinIO if not using R2 locally.

For public launch:

```env
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=travelassistant-media
R2_PUBLIC_BASE_URL=https://cdn.example.com
```

Also prepare domain/DNS and hosting provider values outside source control.

## Scope

- Dockerfile for frontend.
- Dockerfile for backend.
- Dockerfile or worker command.
- Docker Compose for local integration: api, worker, postgres, redis, qdrant, optional minio.
- Reverse proxy config sample for Nginx or Caddy.
- Health checks.
- Backup scripts or documented commands for PostgreSQL and Qdrant snapshots.
- CI workflow for lint, typecheck, tests, and build.
- Deployment notes for Cloudflare Pages/Vercel frontend and VPS backend.

## Do Not

- Do not include production secrets in compose files.
- Do not bind production storage to repository folders.
- Do not require large image data to exist locally.

## Validation

Run:

```powershell
docker compose config
docker compose up -d
python -m pytest
npm run build
```

If Docker is unavailable, validate generated config statically and report the blocker.

## End Report

Report services configured, Docker status, CI status, and remaining deployment values.

## API Key Notice For Next Step

Step 11 needs all keys only if running full end-to-end live checks. Otherwise tests should mock providers.
