"""content media foundation

Revision ID: 0002_content_media
Revises: 0001_auth_account_chat
Create Date: 2026-05-20 00:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0002_content_media"
down_revision: str | None = "0001_auth_account_chat"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "tags",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("slug", sa.String(length=160), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_tags_slug"), "tags", ["slug"], unique=True)

    op.create_table(
        "destinations",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("slug", sa.String(length=180), nullable=False),
        sa.Column("name", sa.String(length=180), nullable=False),
        sa.Column("region", sa.String(length=120), nullable=True),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("hero_image_id", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_destinations_slug"), "destinations", ["slug"], unique=True)

    op.create_table(
        "destination_tags",
        sa.Column("destination_id", sa.String(length=36), nullable=False),
        sa.Column("tag_id", sa.String(length=36), nullable=False),
        sa.ForeignKeyConstraint(["destination_id"], ["destinations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tag_id"], ["tags.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("destination_id", "tag_id"),
    )

    op.create_table(
        "places",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("destination_id", sa.String(length=36), nullable=False),
        sa.Column("slug", sa.String(length=180), nullable=False),
        sa.Column("name", sa.String(length=180), nullable=False),
        sa.Column("kind", sa.String(length=40), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("address", sa.String(length=320), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("price_level", sa.String(length=40), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["destination_id"], ["destinations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("destination_id", "slug", name="uq_places_destination_slug"),
    )
    op.create_index(op.f("ix_places_destination_id"), "places", ["destination_id"])
    op.create_index("ix_places_kind_status", "places", ["kind", "status"])

    op.create_table(
        "articles",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("destination_id", sa.String(length=36), nullable=True),
        sa.Column("slug", sa.String(length=220), nullable=False),
        sa.Column("title", sa.String(length=260), nullable=False),
        sa.Column("excerpt", sa.Text(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("source_url", sa.String(length=1024), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["destination_id"], ["destinations.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_articles_slug"), "articles", ["slug"], unique=True)

    op.create_table(
        "article_tags",
        sa.Column("article_id", sa.String(length=36), nullable=False),
        sa.Column("tag_id", sa.String(length=36), nullable=False),
        sa.ForeignKeyConstraint(["article_id"], ["articles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tag_id"], ["tags.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("article_id", "tag_id"),
    )

    op.create_table(
        "article_chunks",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("article_id", sa.String(length=36), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["article_id"], ["articles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_article_chunks_article_id"), "article_chunks", ["article_id"])

    op.create_table(
        "place_tags",
        sa.Column("place_id", sa.String(length=36), nullable=False),
        sa.Column("tag_id", sa.String(length=36), nullable=False),
        sa.ForeignKeyConstraint(["place_id"], ["places.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tag_id"], ["tags.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("place_id", "tag_id"),
    )

    op.create_table(
        "images",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("owner_user_id", sa.String(length=36), nullable=True),
        sa.Column("destination_id", sa.String(length=36), nullable=True),
        sa.Column("place_id", sa.String(length=36), nullable=True),
        sa.Column("object_key", sa.String(length=512), nullable=False),
        sa.Column("public_url", sa.String(length=1024), nullable=False),
        sa.Column("mime_type", sa.String(length=120), nullable=False),
        sa.Column("byte_size", sa.Integer(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("alt_text", sa.String(length=320), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["destination_id"], ["destinations.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["owner_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["place_id"], ["places.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("object_key"),
    )

    op.create_table(
        "image_variants",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("image_id", sa.String(length=36), nullable=False),
        sa.Column("variant_name", sa.String(length=80), nullable=False),
        sa.Column("object_key", sa.String(length=512), nullable=False),
        sa.Column("public_url", sa.String(length=1024), nullable=False),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("byte_size", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["image_id"], ["images.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_image_variants_image_id"), "image_variants", ["image_id"])

    op.create_table(
        "itinerary_templates",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("destination_id", sa.String(length=36), nullable=True),
        sa.Column("slug", sa.String(length=220), nullable=False),
        sa.Column("title", sa.String(length=260), nullable=False),
        sa.Column("days", sa.Integer(), nullable=False),
        sa.Column("budget_level", sa.String(length=64), nullable=True),
        sa.Column("traveler_type", sa.String(length=80), nullable=True),
        sa.Column("plan_json", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["destination_id"], ["destinations.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_itinerary_templates_slug"), "itinerary_templates", ["slug"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_itinerary_templates_slug"), table_name="itinerary_templates")
    op.drop_table("itinerary_templates")
    op.drop_index(op.f("ix_image_variants_image_id"), table_name="image_variants")
    op.drop_table("image_variants")
    op.drop_table("images")
    op.drop_table("place_tags")
    op.drop_index(op.f("ix_article_chunks_article_id"), table_name="article_chunks")
    op.drop_table("article_chunks")
    op.drop_table("article_tags")
    op.drop_index(op.f("ix_articles_slug"), table_name="articles")
    op.drop_table("articles")
    op.drop_index("ix_places_kind_status", table_name="places")
    op.drop_index(op.f("ix_places_destination_id"), table_name="places")
    op.drop_table("places")
    op.drop_table("destination_tags")
    op.drop_index(op.f("ix_destinations_slug"), table_name="destinations")
    op.drop_table("destinations")
    op.drop_index(op.f("ix_tags_slug"), table_name="tags")
    op.drop_table("tags")
