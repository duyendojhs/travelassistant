"""admin cms bi

Revision ID: 0007_admin_cms_bi
Revises: 0006_voice_jobs
Create Date: 2026-05-20 00:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0007_admin_cms_bi"
down_revision: str | None = "0006_voice_jobs"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "product_events",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=True),
        sa.Column("event_name", sa.String(length=120), nullable=False),
        sa.Column("intent", sa.String(length=120), nullable=True),
        sa.Column("destination_slug", sa.String(length=220), nullable=True),
        sa.Column("session_id", sa.String(length=120), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("cost_usd", sa.Float(), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_product_events_created_at"), "product_events", ["created_at"])
    op.create_index(op.f("ix_product_events_destination_slug"), "product_events", ["destination_slug"])
    op.create_index(op.f("ix_product_events_event_name"), "product_events", ["event_name"])
    op.create_index(op.f("ix_product_events_intent"), "product_events", ["intent"])
    op.create_index(op.f("ix_product_events_session_id"), "product_events", ["session_id"])
    op.create_index(op.f("ix_product_events_user_id"), "product_events", ["user_id"])
    op.create_index("ix_product_events_destination_intent", "product_events", ["destination_slug", "intent"])

    op.create_table(
        "model_usage",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=True),
        sa.Column("provider", sa.String(length=80), nullable=False),
        sa.Column("model", sa.String(length=160), nullable=False),
        sa.Column("feature", sa.String(length=80), nullable=False),
        sa.Column("prompt_tokens", sa.Integer(), nullable=False),
        sa.Column("completion_tokens", sa.Integer(), nullable=False),
        sa.Column("total_tokens", sa.Integer(), nullable=False),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("cost_usd", sa.Float(), nullable=False),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_model_usage_created_at"), "model_usage", ["created_at"])
    op.create_index(op.f("ix_model_usage_feature"), "model_usage", ["feature"])
    op.create_index(op.f("ix_model_usage_model"), "model_usage", ["model"])
    op.create_index(op.f("ix_model_usage_provider"), "model_usage", ["provider"])
    op.create_index(op.f("ix_model_usage_user_id"), "model_usage", ["user_id"])
    op.create_index("ix_model_usage_feature_created", "model_usage", ["feature", "created_at"])

    op.create_table(
        "quality_metrics",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("metric_name", sa.String(length=120), nullable=False),
        sa.Column("metric_value", sa.Float(), nullable=False),
        sa.Column("source_type", sa.String(length=80), nullable=True),
        sa.Column("source_id", sa.String(length=120), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_quality_metrics_created_at"), "quality_metrics", ["created_at"])
    op.create_index(op.f("ix_quality_metrics_metric_name"), "quality_metrics", ["metric_name"])
    op.create_index(op.f("ix_quality_metrics_source_id"), "quality_metrics", ["source_id"])
    op.create_index(op.f("ix_quality_metrics_source_type"), "quality_metrics", ["source_type"])
    op.create_index("ix_quality_metrics_name_created", "quality_metrics", ["metric_name", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_quality_metrics_name_created", table_name="quality_metrics")
    op.drop_index(op.f("ix_quality_metrics_source_type"), table_name="quality_metrics")
    op.drop_index(op.f("ix_quality_metrics_source_id"), table_name="quality_metrics")
    op.drop_index(op.f("ix_quality_metrics_metric_name"), table_name="quality_metrics")
    op.drop_index(op.f("ix_quality_metrics_created_at"), table_name="quality_metrics")
    op.drop_table("quality_metrics")

    op.drop_index("ix_model_usage_feature_created", table_name="model_usage")
    op.drop_index(op.f("ix_model_usage_user_id"), table_name="model_usage")
    op.drop_index(op.f("ix_model_usage_provider"), table_name="model_usage")
    op.drop_index(op.f("ix_model_usage_model"), table_name="model_usage")
    op.drop_index(op.f("ix_model_usage_feature"), table_name="model_usage")
    op.drop_index(op.f("ix_model_usage_created_at"), table_name="model_usage")
    op.drop_table("model_usage")

    op.drop_index("ix_product_events_destination_intent", table_name="product_events")
    op.drop_index(op.f("ix_product_events_user_id"), table_name="product_events")
    op.drop_index(op.f("ix_product_events_session_id"), table_name="product_events")
    op.drop_index(op.f("ix_product_events_intent"), table_name="product_events")
    op.drop_index(op.f("ix_product_events_event_name"), table_name="product_events")
    op.drop_index(op.f("ix_product_events_destination_slug"), table_name="product_events")
    op.drop_index(op.f("ix_product_events_created_at"), table_name="product_events")
    op.drop_table("product_events")
