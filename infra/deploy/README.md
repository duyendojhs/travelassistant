# Deployment Notes

## Low-cost public launch

- Frontend: Vercel free project from `apps/web`.
- API: Render free web service using `render.yaml` or `apps/api/Dockerfile`.
- Postgres: Neon Free.
- Redis: Upstash Redis Free. Use `rediss://`.
- Vector DB: Qdrant Cloud.
- Media: current MVP uses local `/uploads` on the API service. For durable production media, add real R2 upload support before relying on generated audio/image history.

## Render API env values

Set these in Render. Do not commit real values.

```env
APP_ENV=production
DATABASE_URL=postgresql+psycopg://...
REDIS_URL=rediss://...
JWT_SECRET_KEY=...
OPENAI_API_KEY=...
QDRANT_URL=https://...
QDRANT_API_KEY=...
QDRANT_COLLECTION=travelassistant_chunks
OBJECT_STORAGE_PROVIDER=local
PUBLIC_APP_URL=https://your-frontend-domain
API_BASE_URL=https://your-api-domain
CORS_ALLOWED_ORIGINS=https://your-frontend-domain
R2_PUBLIC_BASE_URL=https://your-api-domain/uploads
```

After first deploy:

```bash
python -m app.db.create_admin
python -m app.dataops.reindex_rag
```

For admin creation, set these only for the command/runtime where you create the admin:

```env
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=replace-with-a-real-password
ADMIN_ROLE=admin
```

## Vercel frontend env values

```env
NEXT_PUBLIC_API_BASE_URL=https://your-api-domain/api/v1
NEXT_PUBLIC_APP_NAME=TravelAssistant
NEXT_PUBLIC_MAP_PROVIDER=osm
```

## Local Docker integration

```bash
docker compose --env-file .env -f infra/docker/docker-compose.yml config
docker compose --env-file .env -f infra/docker/docker-compose.yml up -d --build
```

Open:

- Web: `http://localhost:3000`
- API health: `http://localhost:8000/health`

## Backup commands

Postgres:

```bash
pg_dump "$DATABASE_URL" --format=custom --file=backup.dump
```

Qdrant snapshots are provider-managed on Qdrant Cloud. For self-hosted Qdrant, use the collection snapshot endpoint or CLI against `QDRANT_URL`.
