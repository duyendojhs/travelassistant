# Step 02 - Config And Security Baseline

## Goal

Implement environment-driven configuration, settings validation, and basic security defaults.

## Scope

Backend:

- Add typed settings loaded from environment.
- Validate `APP_ENV`, `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET_KEY`, and `CORS_ALLOWED_ORIGINS`.
- Refuse unsafe defaults in staging/production.
- Configure CORS from env, not wildcard.
- Add structured error responses.
- Add health endpoints: `/health`, `/api/v1/health`.

Frontend:

- Add typed public env access for `NEXT_PUBLIC_API_BASE_URL`, app name, map provider, and monitoring public keys.
- Create an API client base that never hard-codes absolute deployment URLs.

Repository:

- Ensure `.env.example` is complete.
- Ensure `.gitignore` excludes secret and local runtime files.

## Do Not

- Do not add real API keys.
- Do not use the old hard-coded JWT secret.
- Do not use `allow_origins=["*"]` for production.

## Validation

Run:

```powershell
python -m compileall apps/api
npm run typecheck
npm run lint
```

If tests exist:

```powershell
python -m pytest
npm test
```

## End Report

Report changed config files, validation results, and any required manual env values.

## API Key Notice For Next Step

Step 03 does not require external AI keys. It requires `DATABASE_URL` and `JWT_SECRET_KEY` in the local backend environment.
