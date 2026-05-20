# Step 06 - Chat, Itinerary, Streaming

## Goal

Implement source-backed assistant chat and structured itinerary generation.

## Required Keys Before Live Tests

Set at least one:

```env
OPENAI_API_KEY=...
GEMINI_API_KEY=...
DEFAULT_LLM_PROVIDER=openai
```

Also keep Qdrant available from Step 05.

## Scope

Backend:

- Chat sessions per user/session.
- Message create/list/detail/delete where required.
- Streaming endpoint via SSE for generated answers.
- Idempotency key support for message submission.
- Feedback endpoint with `helpful`, `not_helpful`, `wrong_info`, `outdated_info`.
- RAG answer service with citations and missing-data disclosure.
- Structured itinerary generation endpoint returning days, time blocks, places, costs, route hints, and citations.
- Save/share itinerary endpoints with public share IDs.

Frontend API client:

- Add typed methods for chat, streaming, feedback, itineraries, and share links.

## Do Not

- Do not use a global conversation buffer.
- Do not return uncited grounded claims.
- Do not let model output be the only itinerary data shape. Parse or generate structured JSON and validate it.

## Validation

Run:

```powershell
python -m compileall apps/api
python -m pytest
npm run typecheck
```

Add tests for:

- Per-user session isolation.
- Citation persistence.
- Streaming contract.
- Itinerary schema validation.
- Feedback storage.

## End Report

Report endpoints, tests, and whether live LLM calls ran or were mocked.

## API Key Notice For Next Step

Step 07 needs `OPENAI_API_KEY` for `gpt-4o-mini-transcribe` and `gpt-4o-mini-tts`. Add `GEMINI_API_KEY` only if using Gemini for image analysis or fallback.
