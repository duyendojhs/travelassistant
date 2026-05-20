from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Index, JSON, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.auth import User, new_uuid, utc_now


class ProductEvent(Base):
    __tablename__ = "product_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    event_name: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    intent: Mapped[str | None] = mapped_column(String(120), index=True)
    destination_slug: Mapped[str | None] = mapped_column(String(220), index=True)
    session_id: Mapped[str | None] = mapped_column(String(120), index=True)
    latency_ms: Mapped[int | None]
    cost_usd: Mapped[float | None] = mapped_column(Float)
    metadata_json: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False, index=True)

    user: Mapped[User | None] = relationship()


class ModelUsage(Base):
    __tablename__ = "model_usage"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    provider: Mapped[str] = mapped_column(String(80), nullable=False, default="openai", index=True)
    model: Mapped[str] = mapped_column(String(160), nullable=False, index=True)
    feature: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    prompt_tokens: Mapped[int] = mapped_column(nullable=False, default=0)
    completion_tokens: Mapped[int] = mapped_column(nullable=False, default=0)
    total_tokens: Mapped[int] = mapped_column(nullable=False, default=0)
    latency_ms: Mapped[int | None]
    cost_usd: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    metadata_json: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False, index=True)

    user: Mapped[User | None] = relationship()


class QualityMetric(Base):
    __tablename__ = "quality_metrics"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    metric_name: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    metric_value: Mapped[float] = mapped_column(Float, nullable=False)
    source_type: Mapped[str | None] = mapped_column(String(80), index=True)
    source_id: Mapped[str | None] = mapped_column(String(120), index=True)
    metadata_json: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False, index=True)


Index("ix_product_events_destination_intent", ProductEvent.destination_slug, ProductEvent.intent)
Index("ix_model_usage_feature_created", ModelUsage.feature, ModelUsage.created_at)
Index("ix_quality_metrics_name_created", QualityMetric.metric_name, QualityMetric.created_at)
