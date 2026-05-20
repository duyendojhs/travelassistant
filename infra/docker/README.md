# Local Docker Services

This compose file provides local integration services:

- FastAPI backend.
- RQ worker for ingestion jobs.
- Next.js frontend.
- PostgreSQL for application data.
- Redis for cache, rate limits, and queues.
- Qdrant for vector search.
- MinIO as a local object-storage adapter.

Start from the repository root:

```powershell
docker compose -f infra/docker/docker-compose.yml config --quiet
docker compose -f infra/docker/docker-compose.yml up -d --build
```

If you want live OpenAI calls in Docker, provide `OPENAI_API_KEY` in your shell before starting compose. The local Docker stack uses local PostgreSQL, Redis, Qdrant, and `/uploads` regardless of the production database values in `.env`.
