# Step 04 - Content And Media API

## Goal

Implement production-shaped travel content, image metadata, and CMS-ready CRUD foundations.

## Scope

Backend models and APIs for:

- Destinations.
- Places.
- Restaurants and foods.
- Hotels and stays.
- Articles.
- Article chunks.
- Images and image variants.
- Itinerary templates.
- Tags.

Admin APIs:

- CRUD for the above where appropriate.
- Draft, review, published, archived statuses.
- Audit log on create/update/delete/publish.

Public APIs:

- Destination list/detail.
- Places, foods, hotels by destination.
- Article list/detail.
- Search endpoint.

Media:

- Store object keys and public CDN URLs.
- Do not return local absolute paths.
- Add a local development storage adapter that can later be replaced by R2/MinIO/S3.
- Validate image MIME type and size.

## Seed Data

Add small seed data only. Use real Vietnamese place names, but keep text clean UTF-8. Do not commit large crawled data or images.

## Validation

Run:

```powershell
python -m compileall apps/api
python -m pytest
```

Add tests for:

- Public destination endpoints.
- Admin role enforcement.
- Image metadata path safety.
- Audit log creation.

## End Report

Report models, endpoints, tests, and whether storage is local-dev only or object-storage ready.

## API Key Notice For Next Step

Step 05 needs an embedding provider key for live ingestion. Prepare `OPENAI_API_KEY` first if OpenAI embeddings are used. If no key is available, the agent should implement interfaces and skip live embedding calls.
