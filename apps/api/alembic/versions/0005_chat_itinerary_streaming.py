"""chat itinerary streaming

Revision ID: 0005_chat_itinerary_streaming
Revises: 0004_generic_rag
Create Date: 2026-05-20 00:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0005_chat_itinerary_streaming"
down_revision: str | None = "0004_generic_rag"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("chat_messages", sa.Column("idempotency_key", sa.String(length=128), nullable=True))
    op.create_index(
        "ix_chat_messages_session_id_idempotency_key",
        "chat_messages",
        ["session_id", "idempotency_key"],
        unique=True,
    )

    op.create_table(
        "saved_itineraries",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("owner_user_id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=260), nullable=False),
        sa.Column("destination", sa.String(length=180), nullable=False),
        sa.Column("days", sa.Integer(), nullable=False),
        sa.Column("request_json", sa.JSON(), nullable=False),
        sa.Column("plan_json", sa.JSON(), nullable=False),
        sa.Column("citations", sa.JSON(), nullable=False),
        sa.Column("source_chunks", sa.JSON(), nullable=False),
        sa.Column("share_id", sa.String(length=64), nullable=True),
        sa.Column("is_shared", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["owner_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_saved_itineraries_owner_user_id"), "saved_itineraries", ["owner_user_id"])
    op.create_index(op.f("ix_saved_itineraries_share_id"), "saved_itineraries", ["share_id"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_saved_itineraries_share_id"), table_name="saved_itineraries")
    op.drop_index(op.f("ix_saved_itineraries_owner_user_id"), table_name="saved_itineraries")
    op.drop_table("saved_itineraries")
    op.drop_index("ix_chat_messages_session_id_idempotency_key", table_name="chat_messages")
    op.drop_column("chat_messages", "idempotency_key")
