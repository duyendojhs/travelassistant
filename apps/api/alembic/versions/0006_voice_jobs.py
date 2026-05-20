"""voice jobs

Revision ID: 0006_voice_jobs
Revises: 0005_chat_itinerary_streaming
Create Date: 2026-05-20 00:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0006_voice_jobs"
down_revision: str | None = "0005_chat_itinerary_streaming"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "voice_jobs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("provider", sa.String(length=80), nullable=False),
        sa.Column("stt_model", sa.String(length=160), nullable=True),
        sa.Column("tts_model", sa.String(length=160), nullable=True),
        sa.Column("input_object_key", sa.String(length=512), nullable=True),
        sa.Column("output_object_key", sa.String(length=512), nullable=True),
        sa.Column("output_public_url", sa.String(length=1024), nullable=True),
        sa.Column("mime_type", sa.String(length=120), nullable=True),
        sa.Column("byte_size", sa.Integer(), nullable=True),
        sa.Column("duration_seconds", sa.Float(), nullable=True),
        sa.Column("transcript", sa.Text(), nullable=True),
        sa.Column("answer", sa.Text(), nullable=True),
        sa.Column("citations", sa.JSON(), nullable=False),
        sa.Column("source_chunks", sa.JSON(), nullable=False),
        sa.Column("events", sa.JSON(), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_voice_jobs_user_id"), "voice_jobs", ["user_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_voice_jobs_user_id"), table_name="voice_jobs")
    op.drop_table("voice_jobs")
