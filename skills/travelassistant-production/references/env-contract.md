# Environment Contract

## Secret Rules

- Commit `.env.example` only.
- Keep local secrets in `.env` for backend/Docker and `apps/web/.env.local` for frontend public variables.
- Production secrets must be set in the hosting provider or secret manager.
- Never print secrets in logs.
- Validate required env variables at startup with clear errors.

## Core Variables

```env
APP_ENV=local
APP_NAME=TravelAssistant
PUBLIC_APP_URL=http://localhost:3000
API_BASE_URL=http://localhost:8000
CORS_ALLOWED_ORIGINS=http://localhost:3000

JWT_SECRET_KEY=change-me
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=30
JWT_REFRESH_TOKEN_EXPIRE_DAYS=30

DATABASE_URL=postgresql+psycopg://travelassistant:travelassistant@localhost:5432/travelassistant
REDIS_URL=redis://localhost:6379/0

OPENAI_API_KEY=
GEMINI_API_KEY=
DEFAULT_LLM_PROVIDER=openai
DEFAULT_STT_PROVIDER=openai
DEFAULT_TTS_PROVIDER=openai
STT_MODEL=gpt-4o-mini-transcribe
TTS_MODEL=gpt-4o-mini-tts
VOICE_NAME=alloy

VECTOR_DB_PROVIDER=qdrant
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=
QDRANT_COLLECTION=travelassistant_chunks

OBJECT_STORAGE_PROVIDER=r2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=travelassistant-media
R2_PUBLIC_BASE_URL=https://cdn.example.com

MAP_PROVIDER=osm
MAPBOX_ACCESS_TOKEN=
GOOGLE_MAPS_API_KEY=

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=

EMAIL_PROVIDER=resend
RESEND_API_KEY=
EMAIL_FROM=no-reply@example.com

SENTRY_DSN=
POSTHOG_API_KEY=
POSTHOG_HOST=https://app.posthog.com
```

## Frontend Public Variables

Only expose values that are safe for browsers:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_APP_NAME=TravelAssistant
NEXT_PUBLIC_MAP_PROVIDER=osm
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com
NEXT_PUBLIC_SENTRY_DSN=
```

Do not expose OpenAI, Gemini, database, Redis, JWT, R2 secret, OAuth secret, or email provider secrets to the frontend.

## API Key Timing By Step

- Steps 01-04: no external AI key should be required.
- Step 05: `OPENAI_API_KEY` or chosen embedding provider key is needed for live embedding ingestion.
- Step 06: `OPENAI_API_KEY` or `GEMINI_API_KEY` is needed for live chat generation.
- Step 07: `OPENAI_API_KEY` is needed for STT/TTS. `GEMINI_API_KEY` is optional for vision fallback.
- Step 10: R2 credentials and domain/DNS settings are needed for realistic deployment.

If the required key is missing, implement provider interfaces and mark live tests skipped. Do not fake provider success.
