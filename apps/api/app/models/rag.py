from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.auth import User, new_uuid, utc_now


class EmbeddingJob(Base):
    __tablename__ = "embedding_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="queued")
    provider: Mapped[str] = mapped_column(String(80), nullable=False, default="openai")
    embedding_model: Mapped[str] = mapped_column(String(160), nullable=False)
    vector_collection: Mapped[str] = mapped_column(String(160), nullable=False)
    requested_by_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    total_chunks: Mapped[int] = mapped_column(nullable=False, default=0)
    indexed_chunks: Mapped[int] = mapped_column(nullable=False, default=0)
    error_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    requested_by: Mapped[User | None] = relationship()


class RagSource(Base):
    __tablename__ = "rag_sources"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    source_type: Mapped[str] = mapped_column(String(80), nullable=False)
    source_id: Mapped[str] = mapped_column(String(36), nullable=False)
    slug: Mapped[str] = mapped_column(String(220), nullable=False)
    title: Mapped[str] = mapped_column(String(260), nullable=False)
    summary: Mapped[str | None] = mapped_column(Text)
    canonical_url: Mapped[str | None] = mapped_column(String(1024))
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="published")
    metadata_json: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )

    chunks: Mapped[list["RagChunk"]] = relationship(back_populates="source", cascade="all, delete-orphan")


class RagChunk(Base):
    __tablename__ = "rag_chunks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    source_id: Mapped[str] = mapped_column(ForeignKey("rag_sources.id", ondelete="CASCADE"), index=True)
    point_id: Mapped[str] = mapped_column(String(36), unique=True, index=True, nullable=False)
    chunk_index: Mapped[int] = mapped_column(nullable=False)
    chunk_type: Mapped[str] = mapped_column(String(80), nullable=False, default="body")
    heading_path: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    token_estimate: Mapped[int] = mapped_column(nullable=False, default=0)
    char_start: Mapped[int | None]
    char_end: Mapped[int | None]
    embedding_model: Mapped[str | None] = mapped_column(String(160))
    vector_collection: Mapped[str | None] = mapped_column(String(160))
    embedded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    metadata_json: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    source: Mapped[RagSource] = relationship(back_populates="chunks")
