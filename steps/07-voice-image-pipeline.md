# Step 07 - Voice And Image Pipeline

## Goal

Implement production voice and image workflows using separated, observable steps.

## Required Keys Before Live Tests

```env
OPENAI_API_KEY=...
DEFAULT_STT_PROVIDER=openai
DEFAULT_TTS_PROVIDER=openai
STT_MODEL=gpt-4o-mini-transcribe
TTS_MODEL=gpt-4o-mini-tts
VOICE_NAME=alloy
```

Optional:

```env
GEMINI_API_KEY=...
```

## Scope

Voice:

- `POST /api/v1/voice/stt`
- `POST /api/v1/voice/tts`
- `POST /api/v1/voice/query`
- `GET /api/v1/voice/status/{job_id}`
- Job support for long audio.
- Audio duration, MIME type, and size limits.
- TTS result storage through object storage adapter or short streaming response.
- Status events: uploaded, transcribing, retrieving, generating, speaking, done, failed.

Image:

- `POST /api/v1/images/upload`
- `POST /api/v1/images/analyze`
- `GET /api/v1/images/{image_id}`
- `GET /api/v1/images/{image_id}/variants`
- `DELETE /api/v1/images/{image_id}`
- Optional `POST /api/v1/images/search-similar`
- File validation and metadata persistence.
- No local absolute paths in responses.

## Validation

Run:

```powershell
python -m compileall apps/api
python -m pytest
```

If keys are present, run one short STT/TTS smoke test with a tiny fixture or generated audio. If not, mock provider calls and clearly skip live tests.

## End Report

Report voice/image endpoints, provider status, tests, and skipped live calls.

## API Key Notice For Next Step

Step 08 does not require AI keys if backend endpoints are mocked or already running. It needs `NEXT_PUBLIC_API_BASE_URL` in `apps/web/.env.local`.
