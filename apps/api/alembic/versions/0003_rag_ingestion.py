"""rag ingestion foundation

Revision ID: 0003_rag_ingestion
Revises: 0002_content_media
Create Date: 2026-05-20 00:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0003_rag_ingestion"
down_revision: str | None = "0002_content_media"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("article_chunks", sa.Column("point_id", sa.String(length=36), nullable=True))
    op.add_column("article_chunks", sa.Column("source_type", sa.String(length=80), nullable=False, server_default="article"))
    op.add_column("article_chunks", sa.Column("source_id", sa.String(length=36), nullable=True))
    op.add_column("article_chunks", sa.Column("source_slug", sa.String(length=220), nullable=True))
    op.add_column("article_chunks", sa.Column("source_title", sa.String(length=260), nullable=True))
    op.add_column("article_chunks", sa.Column("embedding_model", sa.String(length=160), nullable=True))
    op.add_column("article_chunks", sa.Column("vector_collection", sa.String(length=160), nullable=True))
    op.add_column("article_chunks", sa.Column("embedded_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index(op.f("ix_article_chunks_point_id"), "article_chunks", ["point_id"], unique=True)

    op.execute(
        """
        UPDATE article_chunks
        SET source_id = article_id,
            source_slug = articles.slug,
            source_title = articles.title
        FROM articles
        WHERE article_chunks.article_id = articles.id
        """
    )

    op.create_table(
        "embedding_jobs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("provider", sa.String(length=80), nullable=False),
        sa.Column("embedding_model", sa.String(length=160), nullable=False),
        sa.Column("vector_collection", sa.String(length=160), nullable=False),
        sa.Column("requested_by_user_id", sa.String(length=36), nullable=True),
        sa.Column("total_chunks", sa.Integer(), nullable=False),
        sa.Column("indexed_chunks", sa.Integer(), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["requested_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("embedding_jobs")
    op.drop_index(op.f("ix_article_chunks_point_id"), table_name="article_chunks")
    op.drop_column("article_chunks", "embedded_at")
    op.drop_column("article_chunks", "vector_collection")
    op.drop_column("article_chunks", "embedding_model")
    op.drop_column("article_chunks", "source_title")
    op.drop_column("article_chunks", "source_slug")
    op.drop_column("article_chunks", "source_id")
    op.drop_column("article_chunks", "source_type")
    op.drop_column("article_chunks", "point_id")
