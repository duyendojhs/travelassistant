# Step 03 - Database, Auth, RBAC

## Goal

Replace legacy SQLite-style assumptions with PostgreSQL-ready auth, account, and role infrastructure.

## Scope

Backend:

- Add database engine/session setup driven by `DATABASE_URL`.
- Add migrations with Alembic or equivalent.
- Add models/tables for users, refresh tokens, profiles, preferences, audit logs, chat sessions, and messages.
- Implement password hashing with bcrypt or argon2.
- Implement register, login, logout, refresh, me, profile, preferences.
- Add role helper for `guest`, `user`, `editor`, `admin`, `root`.
- Add login/register rate-limit interfaces using Redis-ready storage.

Frontend:

- Add auth API client methods and minimal session state helper.
- Do not build the final UI yet unless needed for smoke testing.

## Data Model Notes

User preferences should reflect travel needs:

- home city, language, budget, travel style, interests, constraints, wishlist, saved itinerary references.

Do not copy the old `dietary_goals`, recipe, or nutrition fields unless migrating legacy compatibility intentionally.

## Validation

Run:

```powershell
python -m compileall apps/api
python -m pytest
npm run typecheck
```

Add tests for:

- Password hash verification.
- Register/login happy path.
- Refresh token rotation.
- Role checks.
- CORS/settings failures for unsafe production config.

## End Report

Report endpoints implemented, migrations added, tests run, and local database setup notes.

## API Key Notice For Next Step

Step 04 does not require AI keys. It may require local PostgreSQL and Redis running.
