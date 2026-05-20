from __future__ import annotations

import re
from typing import Annotated
from time import perf_counter

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.settings import Settings, get_settings
from app.db.session import get_db
from app.models.auth import User, utc_now
from app.models.voice import VoiceJob
from app.schemas.voice import STTResponse, TTSRequest, TTSResponse, VoiceJobResponse
from app.services.analytics import record_model_usage, record_product_event
from app.services.embeddings import MissingEmbeddingProviderKey, get_embedding_provider
from app.services.llm import MissingLLMProviderKey, get_llm_provider
from app.services.rag_answer import RAGAnswerService
from app.services.retrieval import RetrievalService
from app.services.storage import LocalAudioStorage
from app.services.vector_store import QdrantVectorStore
from app.services.voice import MissingSpeechProviderKey, get_speech_provider, inspect_audio

router = APIRouter(prefix="/voice", tags=["voice"])


def _add_event(job: VoiceJob, status_value: str, message: str | None = None) -> None:
    events = list(job.events or [])
    event: dict[str, object] = {"status": status_value, "at": utc_now().isoformat()}
    if message:
        event["message"] = message
    events.append(event)
    job.events = events
    job.status = status_value


async def _read_and_store_audio(
    upload: UploadFile,
    settings: Settings,
) -> tuple[bytes, str, str, int, float | None]:
    storage = LocalAudioStorage(settings)
    stored = await storage.save_audio(upload)
    path = storage.resolve_object_key(stored.object_key)
    content = path.read_bytes()
    inspection = inspect_audio(content, mime_type=stored.mime_type, settings=settings)
    return content, stored.object_key, stored.mime_type, stored.byte_size, inspection.duration_seconds


def _speech_provider(settings: Settings):
    try:
        return get_speech_provider(settings)
    except MissingSpeechProviderKey as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc


def _tts_storage_format(provider_name: str) -> tuple[str, str]:
    if provider_name == "disabled":
        return "audio/wav", ".wav"
    return "audio/mpeg", ".mp3"


def _require_transcript(transcript: str) -> str:
    normalized = transcript.strip()
    if not normalized:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Không nghe thấy nội dung rõ ràng. Hãy nói lại gần micro hơn.",
        )
    return normalized


def _is_audio_decode_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return "audio file might be corrupted or unsupported" in message or (
        "invalid_value" in message and "file" in message
    )


def _audio_decode_exception(exc: Exception) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail="File ghi âm không hợp lệ hoặc trình duyệt đã ghi sai định dạng. Hãy thử ghi lại.",
    )


def _spoken_answer_text(text: str) -> str:
    without_citations = re.sub(r"\s*\[(?:\d+)(?:\s*,\s*\d+)*\]", "", text)
    without_source_list = re.sub(
        r"\s*(?:dựa trên|theo|từ)\s+nguồn(?:\s+tham khảo)?(?:\s+số)?(?:\s+\d+|\s*,|\s+và|\s+)+",
        " ",
        without_citations,
        flags=re.IGNORECASE,
    )
    return " ".join(without_source_list.split()).strip()


@router.post("/stt", response_model=STTResponse)
async def speech_to_text(
    file: Annotated[UploadFile, File()],
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    current_user: User = Depends(get_current_user),
) -> STTResponse:
    provider = _speech_provider(settings)
    content, object_key, mime_type, byte_size, duration_seconds = await _read_and_store_audio(file, settings)
    job = VoiceJob(
        user_id=current_user.id,
        status="uploaded",
        provider=provider.provider,
        stt_model=provider.stt_model,
        tts_model=provider.tts_model,
        input_object_key=object_key,
        mime_type=mime_type,
        byte_size=byte_size,
        duration_seconds=duration_seconds,
    )
    _add_event(job, "uploaded")
    db.add(job)
    db.flush()
    try:
        started = perf_counter()
        _add_event(job, "transcribing")
        transcript = _require_transcript(
            provider.transcribe(content, filename=file.filename or "audio", mime_type=mime_type)
        )
        job.transcript = transcript
        _add_event(job, "done")
        record_model_usage(
            db,
            user_id=current_user.id,
            model_provider=f"{provider.provider}:{provider.stt_model}",
            feature="voice_stt",
            prompt_text=file.filename or "audio",
            completion_text=transcript,
            latency_ms=int((perf_counter() - started) * 1000),
            metadata={"mime_type": mime_type, "byte_size": byte_size},
        )
        db.commit()
    except Exception as exc:
        if isinstance(exc, HTTPException):
            _add_event(job, "failed", str(exc.detail))
            job.error_message = str(exc.detail)
            db.commit()
            raise
        if _is_audio_decode_error(exc):
            api_error = _audio_decode_exception(exc)
            _add_event(job, "failed", str(api_error.detail))
            job.error_message = str(api_error.detail)
            db.commit()
            raise api_error from exc
        _add_event(job, "failed", str(exc))
        job.error_message = str(exc)
        db.commit()
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Speech transcription failed") from exc
    db.refresh(job)
    return STTResponse(job=VoiceJobResponse.model_validate(job), transcript=transcript)


@router.post("/tts", response_model=TTSResponse)
def text_to_speech(
    payload: TTSRequest,
    settings: Settings = Depends(get_settings),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TTSResponse:
    provider = _speech_provider(settings)
    try:
        started = perf_counter()
        audio = provider.synthesize(_spoken_answer_text(payload.text))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Speech synthesis failed") from exc
    mime_type, extension = _tts_storage_format(provider.provider)
    stored = LocalAudioStorage(settings).save_audio_bytes(audio, mime_type=mime_type, extension=extension)
    record_model_usage(
        db,
        user_id=current_user.id,
        model_provider=f"{provider.provider}:{provider.tts_model}",
        feature="voice_tts",
        prompt_text=payload.text,
        completion_text=f"{stored.byte_size} bytes",
        latency_ms=int((perf_counter() - started) * 1000),
        metadata={"mime_type": stored.mime_type, "object_key": stored.object_key},
    )
    db.commit()
    return TTSResponse(
        object_key=stored.object_key,
        public_url=stored.public_url,
        mime_type=stored.mime_type,
        byte_size=stored.byte_size,
    )


@router.post("/query", response_model=VoiceJobResponse)
async def voice_query(
    file: Annotated[UploadFile, File()],
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    current_user: User = Depends(get_current_user),
) -> VoiceJobResponse:
    provider = _speech_provider(settings)
    content, object_key, mime_type, byte_size, duration_seconds = await _read_and_store_audio(file, settings)
    job = VoiceJob(
        user_id=current_user.id,
        status="uploaded",
        provider=provider.provider,
        stt_model=provider.stt_model,
        tts_model=provider.tts_model,
        input_object_key=object_key,
        mime_type=mime_type,
        byte_size=byte_size,
        duration_seconds=duration_seconds,
    )
    _add_event(job, "uploaded")
    db.add(job)
    db.flush()
    try:
        started = perf_counter()
        _add_event(job, "transcribing")
        transcript = _require_transcript(
            provider.transcribe(content, filename=file.filename or "audio", mime_type=mime_type)
        )
        job.transcript = transcript

        _add_event(job, "retrieving")
        answer_service = RAGAnswerService(
            retrieval_service=RetrievalService(
                embedding_provider=get_embedding_provider(settings),
                vector_store=QdrantVectorStore(settings),
            ),
            llm_provider=get_llm_provider(settings),
        )

        _add_event(job, "generating")
        answer = answer_service.answer(db, transcript)
        job.answer = answer.answer
        job.citations = answer.citations
        job.source_chunks = answer.source_chunks

        _add_event(job, "speaking")
        spoken_answer = _spoken_answer_text(answer.answer)
        audio = provider.synthesize(spoken_answer)
        output_mime_type, output_extension = _tts_storage_format(provider.provider)
        stored = LocalAudioStorage(settings).save_audio_bytes(
            audio,
            mime_type=output_mime_type,
            extension=output_extension,
        )
        job.output_object_key = stored.object_key
        job.output_public_url = stored.public_url
        _add_event(job, "done")
        latency_ms = int((perf_counter() - started) * 1000)
        record_model_usage(
            db,
            user_id=current_user.id,
            model_provider=f"{provider.provider}:{provider.stt_model}+{provider.tts_model}",
            feature="voice_query",
            prompt_text=transcript,
            completion_text=answer.answer,
            latency_ms=latency_ms,
            metadata={"citation_count": len(answer.citations), "output_object_key": stored.object_key},
        )
        record_product_event(
            db,
            user_id=current_user.id,
            event_name="voice_query",
            intent="voice_travel_question",
            latency_ms=latency_ms,
            metadata={"status_events": [event["status"] for event in job.events or []]},
        )
        db.commit()
    except (MissingEmbeddingProviderKey, MissingLLMProviderKey) as exc:
        _add_event(job, "failed", str(exc))
        job.error_message = str(exc)
        db.commit()
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except HTTPException as exc:
        _add_event(job, "failed", str(exc.detail))
        job.error_message = str(exc.detail)
        db.commit()
        raise
    except Exception as exc:
        if _is_audio_decode_error(exc):
            api_error = _audio_decode_exception(exc)
            _add_event(job, "failed", str(api_error.detail))
            job.error_message = str(api_error.detail)
            db.commit()
            raise api_error from exc
        _add_event(job, "failed", str(exc))
        job.error_message = str(exc)
        db.commit()
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Voice query failed") from exc

    db.refresh(job)
    return VoiceJobResponse.model_validate(job)


@router.get("/status/{job_id}", response_model=VoiceJobResponse)
def voice_status(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> VoiceJobResponse:
    job = db.get(VoiceJob, job_id)
    if job is None or job.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Voice job not found")
    return VoiceJobResponse.model_validate(job)
