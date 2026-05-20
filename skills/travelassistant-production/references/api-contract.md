# API Contract

All production APIs use `/api/v1`.

## Auth And Account

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/refresh`
- `GET /api/v1/auth/me`
- `PUT /api/v1/account/profile`
- `GET /api/v1/account/preferences`
- `PUT /api/v1/account/preferences`
- `DELETE /api/v1/account`
- `POST /api/v1/auth/oauth/google`

Use password hashing, short access tokens, secure refresh token rotation, rate limits, and role fields: `guest`, `user`, `editor`, `admin`, `root`.

## Chat

- `POST /api/v1/chat/sessions`
- `GET /api/v1/chat/sessions`
- `GET /api/v1/chat/sessions/{session_id}`
- `DELETE /api/v1/chat/sessions/{session_id}`
- `GET /api/v1/chat/sessions/{session_id}/messages`
- `POST /api/v1/chat/sessions/{session_id}/messages`
- `POST /api/v1/chat/sessions/{session_id}/stream`
- `POST /api/v1/chat/feedback`

Messages must store role, content, modality, citations, exact source chunks, latency, model/provider, and feedback state.

## Voice

- `POST /api/v1/voice/stt`
- `POST /api/v1/voice/tts`
- `POST /api/v1/voice/query`
- `GET /api/v1/voice/status/{job_id}`
- `WS /api/v1/voice/live`

MVP voice pipeline is STT -> RAG/LLM -> TTS. Realtime voice is later and must be quota-limited.

## Images

- `POST /api/v1/images/upload`
- `POST /api/v1/images/analyze`
- `GET /api/v1/images/{image_id}`
- `GET /api/v1/images/{image_id}/variants`
- `DELETE /api/v1/images/{image_id}`
- `POST /api/v1/images/search-similar`

Validate file size and type. Store object keys and CDN URLs, not local absolute paths.

## Itineraries

- `POST /api/v1/itineraries/generate`
- `GET /api/v1/itineraries`
- `GET /api/v1/itineraries/{id}`
- `PUT /api/v1/itineraries/{id}`
- `DELETE /api/v1/itineraries/{id}`
- `POST /api/v1/itineraries/{id}/share`
- `GET /api/v1/shared/itineraries/{share_id}`
- `POST /api/v1/itineraries/{id}/export/pdf`

Itinerary responses should be structured by day and time block, with place IDs, cost estimates, map metadata, and citations.

## Destination And Content

- `GET /api/v1/destinations`
- `GET /api/v1/destinations/{slug}`
- `GET /api/v1/destinations/{slug}/places`
- `GET /api/v1/destinations/{slug}/foods`
- `GET /api/v1/destinations/{slug}/hotels`
- `GET /api/v1/places/{id}`
- `GET /api/v1/articles`
- `GET /api/v1/articles/{slug}`
- `GET /api/v1/search`

## Admin CMS

- CRUD for destinations, places, restaurants, hotels, articles, images, tags, itinerary templates.
- Publish/reindex workflow: draft -> review -> published -> archived.
- Audit every content change.
- Restrict to `editor`, `admin`, and `root`.

## BI And DataOps

- `POST /api/v1/events`
- `GET /api/v1/dashboard/overview`
- `GET /api/v1/dashboard/users`
- `GET /api/v1/dashboard/rag-quality`
- `GET /api/v1/dashboard/data-quality`
- `GET /api/v1/dashboard/cost`
- `POST /api/v1/dataops/crawl-jobs`
- `POST /api/v1/dataops/preprocess-jobs`
- `POST /api/v1/dataops/embedding-jobs`
- `POST /api/v1/dataops/reindex`

Prefer event tables that BI tools can read directly from PostgreSQL.
