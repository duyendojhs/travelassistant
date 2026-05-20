---
name: travelassistant-production
description: Build the TravelAssistant production website from the prepared design and checklist documents. Use when implementing or reviewing TravelAssistant in project_root, especially for step-based work, Next.js TypeScript frontend, FastAPI backend, RAG, voice, image upload, maps, CMS/admin, BI, Docker, deployment, API key setup, and avoiding unsafe legacy patterns from the ts/UI reference folders.
---

# TravelAssistant Production

## Purpose

Use this skill to build TravelAssistant as a real public website, not a demo clone of the old UI. Work step by step, keep code deployable, and treat `project_root` as the only target application root.

## Source Priority

Before implementation, prefer the project brief in this order:

1. `references/source-analysis.md`
2. `references/env-contract.md`
3. `references/api-contract.md`
4. `references/frontend-ux-guidelines.md`
5. The active file under `steps/`

The old `ts`, `UI`, and `ui-ux-pro-max-skill` folders are reference material only. Do not copy their bugs, mojibake text, hard-coded secrets, local absolute paths, placeholder audio, global state, or demo-only mock assumptions.

## Hard Rules

- Use relative paths in application code. Do not write drive-letter or machine-local absolute paths into source, config, tests, seed data, or UI output.
- Do not hard-code API keys, JWT secrets, database passwords, bucket credentials, or provider tokens.
- Keep `.env`, `.env.local`, and production secrets out of Git. Only commit `.env.example`.
- Build TypeScript frontend with strong types. Avoid `any` unless a step explains why.
- Build backend with environment-driven settings, PostgreSQL, Redis-ready rate limits/cache/queue, and migration support.
- Store user uploads and 44GB image data in object storage or a local dev object-storage adapter. Do not store large media in Git or serve original images through FastAPI in production.
- Persist chat sessions per user/session. Do not use one global conversation buffer for all users.
- Return sources/citations for RAG answers and store the exact sources used for each answer.
- Use real STT/TTS provider integration in production steps. Placeholder audio is allowed only before the voice step and must be clearly isolated.
- Keep frontend screens modern and low-scroll. Prefer tabs, steppers, drawers, accordions, pagination, segmented panels, and next buttons over long continuous pages.
- Report briefly at the end of each step and state which API keys or services must be ready before the next step.

## Default Architecture

- Frontend: Next.js App Router, TypeScript, responsive PWA, componentized UI.
- Backend: FastAPI, Pydantic settings, SQLAlchemy or SQLModel, Alembic migrations, JWT access tokens plus refresh tokens.
- Data: PostgreSQL for product data, Redis for cache/rate limit/queue, Qdrant for vector search.
- Workers: Celery/RQ/Arq for ingestion, embeddings, image processing, long voice jobs, email.
- Storage: Cloudflare R2 in production, MinIO/local adapter in development.
- AI: OpenAI for STT/TTS and primary fast model, Gemini optional for fallback or vision.
- Maps: OpenStreetMap/Leaflet by default, Mapbox optional through public env only.
- Admin: custom CMS first, Directus integration optional later.
- BI: production-compatible event tables first, Metabase/Superset integration later.

## Step Workflow

For each step:

1. Read this skill and the step file.
2. Read only the referenced files needed for the step.
3. Implement only the scope of the current step.
4. Add or update focused tests for touched behavior.
5. Run the validation commands listed in the step.
6. End with a short report: files changed, checks run, blockers, and next-step API key requirements.

If a step depends on an API key that is missing, create the typed provider interface, settings validation, and skipped tests, then stop before live provider calls. Do not insert fake keys.

## Reference Loading

- Read `source-analysis.md` before architecture, migration, or legacy cleanup work.
- Read `env-contract.md` before settings, Docker, providers, voice, RAG, image storage, maps, OAuth, email, monitoring, or deployment work.
- Read `api-contract.md` before backend route or frontend API client work.
- Read `frontend-ux-guidelines.md` before changing user-facing UI.
