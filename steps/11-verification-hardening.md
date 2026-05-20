# Step 11 - Verification And Hardening

## Goal

Run final checks, fix production blockers, and prepare the app for public launch.

## Scope

Quality:

- Unit tests.
- API integration tests.
- Frontend typecheck/lint/build.
- Browser flow tests for desktop and mobile.
- Accessibility pass.
- No text overflow or broken responsive panels.
- No mojibake.

Security:

- Secret scan.
- No absolute local paths in code or API responses.
- CORS production-safe.
- JWT secret required.
- Role checks for admin endpoints.
- Upload validation.
- Rate limits.

Operational:

- Health checks.
- Logs avoid secrets.
- Sentry or error capture wired if configured.
- AI cost tracking fields stored.
- Backup plan documented.
- Provider quota warnings documented.

## Suggested Checks

```powershell
rg "D:\\\\|C:\\\\|AIza|sk-|SECRET_KEY *=|allow_origins=\\[\"\\*\"\\]" .
python -m pytest
npm run typecheck
npm run lint
npm run build
```

Run browser verification against:

- Auth.
- Chat stream.
- Voice fallback/text path.
- Planner generation.
- Source drawer/evidence.
- Explorer search/map.
- Admin publish/reindex.

## End Report

Report:

- Checks passed.
- Issues fixed.
- Remaining risks.
- Exact env/services required for public launch.

## API Key Notice

For live launch smoke tests, prepare OpenAI, optional Gemini, R2, domain/DNS, email provider, Sentry, and optional Mapbox keys in the deployment environment only.
