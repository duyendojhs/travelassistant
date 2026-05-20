from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

FeedbackState = Literal["helpful", "not_helpful", "wrong_info", "outdated_info"]


class ChatSessionCreate(BaseModel):
    title: str | None = Field(default=None, max_length=240)


class ChatSessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str | None
    title: str | None
    created_at: datetime
    updated_at: datetime


class ChatMessageCreate(BaseModel):
    content: str = Field(min_length=1, max_length=4000)
    modality: str = Field(default="text", max_length=32)
    idempotency_key: str | None = Field(default=None, min_length=8, max_length=128)


class ChatMessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    session_id: str
    role: str
    content: str
    modality: str
    idempotency_key: str | None = None
    citations: list[dict[str, object]]
    source_chunks: list[dict[str, object]]
    latency_ms: int | None = None
    model_provider: str | None = None
    feedback_state: str | None = None
    created_at: datetime


class ChatExchangeResponse(BaseModel):
    user_message: ChatMessageResponse
    assistant_message: ChatMessageResponse


class FeedbackRequest(BaseModel):
    message_id: str
    feedback_state: FeedbackState
