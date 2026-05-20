"""generic rag sources and chunks

Revision ID: 0004_generic_rag
Revises: 0003_rag_ingestion
Create Date: 2026-05-20 00:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0004_generic_rag"
down_revision: str | None = "0003_rag_ingestion"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "rag_sources",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("source_type", sa.String(length=80), nullable=False),
        sa.Column("source_id", sa.String(length=36), nullable=False),
        sa.Column("slug", sa.String(length=220), nullable=False),
        sa.Column("title", sa.String(length=260), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("canonical_url", sa.String(length=1024), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("source_type", "source_id", name="uq_rag_sources_source"),
    )
    op.create_index(op.f("ix_rag_sources_slug"), "rag_sources", ["slug"])
    op.create_index(op.f("ix_rag_sources_source_type"), "rag_sources", ["source_type"])

    op.create_table(
        "rag_chunks",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("source_id", sa.String(length=36), nullable=False),
        sa.Column("point_id", sa.String(length=36), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("chunk_type", sa.String(length=80), nullable=False),
        sa.Column("heading_path", sa.JSON(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("token_estimate", sa.Integer(), nullable=False),
        sa.Column("char_start", sa.Integer(), nullable=True),
        sa.Column("char_end", sa.Integer(), nullable=True),
        sa.Column("embedding_model", sa.String(length=160), nullable=True),
        sa.Column("vector_collection", sa.String(length=160), nullable=True),
        sa.Column("embedded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["source_id"], ["rag_sources.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_rag_chunks_point_id"), "rag_chunks", ["point_id"], unique=True)
    op.create_index(op.f("ix_rag_chunks_source_id"), "rag_chunks", ["source_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_rag_chunks_source_id"), table_name="rag_chunks")
    op.drop_index(op.f("ix_rag_chunks_point_id"), table_name="rag_chunks")
    op.drop_table("rag_chunks")
    op.drop_index(op.f("ix_rag_sources_source_type"), table_name="rag_sources")
    op.drop_index(op.f("ix_rag_sources_slug"), table_name="rag_sources")
    op.drop_table("rag_sources")
