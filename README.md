# TravelAssistant

Production scaffold for TravelAssistant, a Vietnamese travel assistant built as a real public web product.

## Workspace

- `apps/web`: Next.js App Router frontend in TypeScript.
- `apps/api`: FastAPI backend scaffold.
- `packages/shared`: shared API contracts and TypeScript types.
- `infra/docker`: local service definitions for PostgreSQL, Redis, Qdrant, and MinIO.

## Runtime Choices

- Package manager: npm workspaces.
- Frontend: Next.js, React, TypeScript, CSS modules/global CSS.
- Backend: FastAPI, Pydantic Settings, Uvicorn.
- Local services: Docker Compose.

## Local Setup

```powershell
npm install
npm run typecheck
npm run lint
python -m compileall apps/api
```

For local services:

```powershell
docker compose --env-file .env.example -f infra/docker/docker-compose.yml up -d
```

Run the apps:

```powershell
npm run dev:web
npm run api:dev
```

Keep local secrets in `.env` and `apps/web/.env.local`. Commit only `.env.example`.
