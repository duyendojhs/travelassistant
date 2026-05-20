# Step 09 - Admin CMS And BI

## Goal

Build admin content management and decision dashboards for real operations.

## Scope

Admin CMS:

- CRUD screens for destinations, places, restaurants, hotels, articles, images, tags, and itinerary templates.
- Draft, review, published, archived workflow.
- Publish triggers reindex job.
- Audit log viewer.
- Role enforcement for editor/admin/root.

BI dashboards:

- User/product metrics.
- Top destinations and intents.
- RAG quality metrics.
- Data quality metrics.
- Cost and latency metrics.
- Feedback analytics.

Backend:

- Event ingestion endpoint.
- Dashboard APIs backed by database queries.
- Tables for events, feedback, job status, model usage, cost, and quality metrics.

## Optional Integrations

- Directus can be added later for headless CMS speed.
- Metabase/Superset can read directly from PostgreSQL. Do not block core admin UI on them.

## Validation

Run:

```powershell
python -m pytest
npm run typecheck
npm run lint
npm run build
```

Verify:

- Non-admin cannot access admin APIs.
- Publish creates an audit log and reindex job.
- Dashboard handles empty data.
- Tables are usable on mobile through responsive patterns or separate mobile layouts.

## End Report

Report admin features, BI endpoints, tests, and any optional integrations deferred.

## API Key Notice For Next Step

Step 10 may need Cloudflare R2 credentials, a domain, and deployment provider settings. It does not need AI keys unless running full production smoke tests.
