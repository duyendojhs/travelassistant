# Step 05 - RAG Ingestion And Qdrant

## Goal

Build the real retrieval foundation with chunking, embeddings, vector search, citations, and background jobs.

## Required Keys Before Running Live Provider Calls

Set in backend environment:

```env
OPENAI_API_KEY=...
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=
QDRANT_COLLECTION=travelassistant_chunks
```

`GEMINI_API_KEY` is optional if Gemini is selected as fallback.

## Scope

Backend:

- Add provider interfaces for embeddings and LLM generation.
- Add Qdrant client abstraction.
- Add chunking pipeline for articles and CMS content.
- Add embedding jobs via worker queue.
- Add reindex endpoint/job for admin publish workflow.
- Store chunk IDs, source metadata, embedding model version, vector collection name, and timestamps.
- Add retrieval service returning top chunks with scores.
- Persist exact source chunks used for answer generation.

DataOps:

- Port only safe ideas from `../ts/processer`: JSONL reading, text cleaning, destination inference.
- Remove food/recipe/nutrition assumptions.
- Never ingest on first user request.

## API

Implement or prepare:

- `POST /api/v1/dataops/embedding-jobs`
- `POST /api/v1/dataops/reindex`
- `GET /api/v1/dataops/data-quality`
- Retrieval service used by chat/evidence.

## Validation

Run:

```powershell
python -m compileall apps/api
python -m pytest
```

If keys and Qdrant are available, run a small ingestion smoke test with seed content. If not, tests must mock the embedding provider and Qdrant client.

## End Report

Report provider chosen, Qdrant status, chunks indexed, tests run, and live tests skipped if keys were missing.

## API Key Notice For Next Step

Step 06 needs `OPENAI_API_KEY` or `GEMINI_API_KEY` for live chat generation. Keep the same `QDRANT_*` values available for citation-backed answers.
