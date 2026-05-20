from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class VoiceJobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str | None
    status: str
    provider: str
    stt_model: str | None
    tts_model: str | None
    input_object_key: str | None
    output_object_key: str | None
    output_public_url: str | None
    mime_type: str | None
    byte_size: int | None
    duration_seconds: float | None
    transcript: str | None
    answer: str | None
    citations: list[dict[str, object]]
    source_chunks: list[dict[str, object]]
    events: list[dict[str, object]]
    error_message: str | None
    created_at: datetime
    updated_at: datetime


class TTSRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)


class TTSResponse(BaseModel):
    object_key: str
    public_url: str
    mime_type: str
    byte_size: int


class STTResponse(BaseModel):
    job: VoiceJobResponse
    transcript: str
