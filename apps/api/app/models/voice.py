from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.auth import User, new_uuid, utc_now


class VoiceJob(Base):
    __tablename__ = "voice_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="uploaded")
    provider: Mapped[str] = mapped_column(String(80), nullable=False, default="openai")
    stt_model: Mapped[str | None] = mapped_column(String(160))
    tts_model: Mapped[str | None] = mapped_column(String(160))
    input_object_key: Mapped[str | None] = mapped_column(String(512))
    output_object_key: Mapped[str | None] = mapped_column(String(512))
    output_public_url: Mapped[str | None] = mapped_column(String(1024))
    mime_type: Mapped[str | None] = mapped_column(String(120))
    byte_size: Mapped[int | None]
    duration_seconds: Mapped[float | None]
    transcript: Mapped[str | None] = mapped_column(Text)
    answer: Mapped[str | None] = mapped_column(Text)
    citations: Mapped[list[dict[str, object]]] = mapped_column(JSON, nullable=False, default=list)
    source_chunks: Mapped[list[dict[str, object]]] = mapped_column(JSON, nullable=False, default=list)
    events: Mapped[list[dict[str, object]]] = mapped_column(JSON, nullable=False, default=list)
    error_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )

    user: Mapped[User | None] = relationship()
