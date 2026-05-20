# TravelAssistant Source Analysis

## Primary Documents

The new product direction is TravelAssistant, a Vietnamese travel copilot with text chat, voice, itinerary planning, maps, images, accounts, personalization, CMS, BI, DataOps, MLOps, and production DevOps.

Use these requirements as the source of truth:

- Product name: `TravelAssistant`.
- Positioning: practical Vietnamese travel copilot, not a generic chatbot.
- MVP: register/login, source-backed chat, STT/TTS voice pipeline, itinerary generation, save/share, image upload, image cards, maps, CMS CRUD, feedback, dashboard.
- Deployment target: real public launch, roughly 10 users for 5 days, low cost, fast enough for chat and voice.
- Cost-aware stack: Next.js frontend, FastAPI backend, PostgreSQL, Redis, Qdrant, object storage/CDN, worker queue, Docker Compose, Sentry, Cloudflare R2, OpenStreetMap/Leaflet first.

## Legacy Backend Folder: `ts`

Useful ideas:

- FastAPI routing is already split into auth, user, chat, voice, destination, planner, evidence, dashboard, images.
- Existing crawler and preprocessing code show how iVIVU-style article/keypoint data becomes JSONL and metadata.
- Existing RAG flow already returns sources from ChromaDB-like metadata.
- Existing tests document some expected smoke checks.

Do not copy these production risks:

- SQLite database and `database.db` in source tree.
- JWT secret hard-coded in `auth_utils.py`.
- CORS wildcard.
- In-memory rate limiter.
- Uploads saved to local filesystem and absolute paths returned.
- Singleton chatbot with mutable global conversation buffer.
- ChromaDB ingestion triggered during first live request.
- Gemini-only requirement in current coordinator.
- TTS placeholder WAV.
- Food/recipe/nutrition leftovers in schemas, prompts, comments, and filter logic.
- Mojibake Vietnamese text in comments, docs, and UI strings.

## Legacy UI Folder: `UI`

Useful ideas:

- Next.js App Router and TypeScript structure.
- Visual tokens around teal, sand, white surfaces, citation cards, voice orb, stepper, dashboard shell.
- Pages for landing, voice, planner, explorer, evidence, dashboard.
- Lucide icons can be used where they match the design.

Do not copy these production risks:

- Brand is `Lumi Travel AI`; new product must be `TravelAssistant`.
- Many Vietnamese strings are mojibake and must be rewritten as valid UTF-8.
- It is mock-heavy and not connected to real backend contracts.
- Some pages encourage long scroll. New UI should split flows into panels, tabs, steppers, and next actions.
- External image URLs are embedded directly. Production should use backend media metadata and object storage/CDN URLs.

## UI/UX Skill Reference Folder

Use only general design principles:

- Token-driven UI.
- Stable spacing and responsive rules.
- Accessibility, touch targets, reduced motion.
- Avoid low-quality icons, text overflow, and unstable interaction states.

Do not rely on it as an exact implementation guide. It contains platform assumptions and errors that do not match this web product.

## Non-Negotiable Production Requirements

- No absolute local paths in code or API responses.
- No secrets in source.
- Environment-specific configuration.
- PostgreSQL instead of SQLite.
- Redis-backed cache/rate limits/queue readiness.
- Worker queue for heavy jobs.
- Object storage/CDN for images and generated audio/PDF assets.
- Qdrant or pgvector for real RAG.
- Source/citation persistence for every grounded answer.
- Per-session chat state, not a global buffer.
- Frontend text must be correct Vietnamese UTF-8.
- Tests and validation must run after each step.
