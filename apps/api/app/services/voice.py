from __future__ import annotations

import wave
from dataclasses import dataclass
from io import BytesIO
from typing import Protocol

from fastapi import HTTPException, status
from openai import OpenAI

from app.core.settings import Settings


class SpeechProvider(Protocol):
    provider: str
    stt_model: str
    tts_model: str

    def transcribe(self, content: bytes, *, filename: str, mime_type: str) -> str:
        """Return transcript text."""

    def synthesize(self, text: str) -> bytes:
        """Return audio bytes."""


class MissingSpeechProviderKey(RuntimeError):
    pass


@dataclass(frozen=True)
class AudioInspection:
    duration_seconds: float | None


class OpenAISpeechProvider:
    def __init__(self, settings: Settings) -> None:
        if not settings.openai_api_key:
            raise MissingSpeechProviderKey("OPENAI_API_KEY is required for live voice endpoints")
        self.provider = "openai"
        self.stt_model = settings.stt_model
        self.tts_model = settings.tts_model
        self.voice_name = settings.voice_name
        self._client = OpenAI(api_key=settings.openai_api_key)

    def transcribe(self, content: bytes, *, filename: str, mime_type: str) -> str:
        response = self._client.audio.transcriptions.create(
            model=self.stt_model,
            file=(filename, content, mime_type),
        )
        text = getattr(response, "text", "")
        return str(text or "").strip()

    def synthesize(self, text: str) -> bytes:
        response = self._client.audio.speech.create(
            model=self.tts_model,
            voice=self.voice_name,
            input=text,
            response_format="mp3",
        )
        if hasattr(response, "read"):
            return bytes(response.read())
        content = getattr(response, "content", None)
        if isinstance(content, bytes):
            return content
        raise RuntimeError("OpenAI TTS response did not include audio bytes")


class DeterministicSpeechProvider:
    def __init__(self) -> None:
        self.provider = "disabled"
        self.stt_model = "deterministic-stt"
        self.tts_model = "deterministic-tts"

    def transcribe(self, content: bytes, *, filename: str, mime_type: str) -> str:
        return "Goi y lich trinh Da Nang 3 ngay"

    def synthesize(self, text: str) -> bytes:
        return _silent_wav_bytes()


def get_speech_provider(settings: Settings) -> SpeechProvider:
    if settings.default_stt_provider == "disabled" or settings.default_tts_provider == "disabled":
        return DeterministicSpeechProvider()
    if settings.default_stt_provider == "openai" and settings.default_tts_provider == "openai":
        return OpenAISpeechProvider(settings)
    raise MissingSpeechProviderKey("Selected STT/TTS providers are not configured")


def inspect_audio(content: bytes, *, mime_type: str, settings: Settings) -> AudioInspection:
    duration = _wav_duration(content) if mime_type in {"audio/wav", "audio/x-wav"} else None
    if duration is not None and duration > settings.voice_max_audio_seconds:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Audio duration is too long")
    return AudioInspection(duration_seconds=duration)


def _wav_duration(content: bytes) -> float | None:
    try:
        with wave.open(BytesIO(content), "rb") as wav:
            frames = wav.getnframes()
            rate = wav.getframerate()
            if rate <= 0:
                return None
            return frames / float(rate)
    except wave.Error:
        return None


def _silent_wav_bytes() -> bytes:
    buffer = BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(16000)
        wav.writeframes(b"\x00\x00" * 1600)
    return buffer.getvalue()
