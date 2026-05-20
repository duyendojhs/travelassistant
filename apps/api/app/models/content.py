from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Index, JSON, String, Table, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.auth import new_uuid, utc_now

destination_tags = Table(
    "destination_tags",
    Base.metadata,
    Column("destination_id", ForeignKey("destinations.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)

place_tags = Table(
    "place_tags",
    Base.metadata,
    Column("place_id", ForeignKey("places.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)

article_tags = Table(
    "article_tags",
    Base.metadata,
    Column("article_id", ForeignKey("articles.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    slug: Mapped[str] = mapped_column(String(160), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


class Destination(Base):
    __tablename__ = "destinations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    slug: Mapped[str] = mapped_column(String(180), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(180), nullable=False)
    region: Mapped[str | None] = mapped_column(String(120))
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    hero_image_id: Mapped[str | None] = mapped_column(String(36))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )

    places: Mapped[list["Place"]] = relationship(back_populates="destination", cascade="all, delete-orphan")
    articles: Mapped[list["Article"]] = relationship(back_populates="destination")
    itinerary_templates: Mapped[list["ItineraryTemplate"]] = relationship(back_populates="destination")
    tags: Mapped[list[Tag]] = relationship(secondary=destination_tags)


class Place(Base):
    __tablename__ = "places"
    __table_args__ = (
        UniqueConstraint("destination_id", "slug", name="uq_places_destination_slug"),
        Index("ix_places_kind_status", "kind", "status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    destination_id: Mapped[str] = mapped_column(ForeignKey("destinations.id", ondelete="CASCADE"), index=True)
    slug: Mapped[str] = mapped_column(String(180), nullable=False)
    name: Mapped[str] = mapped_column(String(180), nullable=False)
    kind: Mapped[str] = mapped_column(String(40), nullable=False, default="attraction")
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    address: Mapped[str | None] = mapped_column(String(320))
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    price_level: Mapped[str | None] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    metadata_json: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )

    destination: Mapped[Destination] = relationship(back_populates="places")
    tags: Mapped[list[Tag]] = relationship(secondary=place_tags)


class Article(Base):
    __tablename__ = "articles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    destination_id: Mapped[str | None] = mapped_column(ForeignKey("destinations.id", ondelete="SET NULL"))
    slug: Mapped[str] = mapped_column(String(220), unique=True, index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(260), nullable=False)
    excerpt: Mapped[str] = mapped_column(Text, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    source_url: Mapped[str | None] = mapped_column(String(1024))
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )

    destination: Mapped[Destination | None] = relationship(back_populates="articles")
    chunks: Mapped[list["ArticleChunk"]] = relationship(back_populates="article", cascade="all, delete-orphan")
    tags: Mapped[list[Tag]] = relationship(secondary=article_tags)


class ArticleChunk(Base):
    __tablename__ = "article_chunks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    article_id: Mapped[str] = mapped_column(ForeignKey("articles.id", ondelete="CASCADE"), index=True)
    point_id: Mapped[str | None] = mapped_column(String(36), unique=True, index=True)
    chunk_index: Mapped[int] = mapped_column(nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    source_type: Mapped[str] = mapped_column(String(80), nullable=False, default="article")
    source_id: Mapped[str | None] = mapped_column(String(36))
    source_slug: Mapped[str | None] = mapped_column(String(220))
    source_title: Mapped[str | None] = mapped_column(String(260))
    embedding_model: Mapped[str | None] = mapped_column(String(160))
    vector_collection: Mapped[str | None] = mapped_column(String(160))
    embedded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    metadata_json: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    article: Mapped[Article] = relationship(back_populates="chunks")


class MediaImage(Base):
    __tablename__ = "images"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    owner_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    destination_id: Mapped[str | None] = mapped_column(ForeignKey("destinations.id", ondelete="SET NULL"))
    place_id: Mapped[str | None] = mapped_column(ForeignKey("places.id", ondelete="SET NULL"))
    object_key: Mapped[str] = mapped_column(String(512), unique=True, nullable=False)
    public_url: Mapped[str] = mapped_column(String(1024), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(120), nullable=False)
    byte_size: Mapped[int] = mapped_column(nullable=False)
    width: Mapped[int | None]
    height: Mapped[int | None]
    alt_text: Mapped[str | None] = mapped_column(String(320))
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    variants: Mapped[list["ImageVariant"]] = relationship(back_populates="image", cascade="all, delete-orphan")


class ImageVariant(Base):
    __tablename__ = "image_variants"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    image_id: Mapped[str] = mapped_column(ForeignKey("images.id", ondelete="CASCADE"), index=True)
    variant_name: Mapped[str] = mapped_column(String(80), nullable=False)
    object_key: Mapped[str] = mapped_column(String(512), nullable=False)
    public_url: Mapped[str] = mapped_column(String(1024), nullable=False)
    width: Mapped[int | None]
    height: Mapped[int | None]
    byte_size: Mapped[int | None]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    image: Mapped[MediaImage] = relationship(back_populates="variants")


class ItineraryTemplate(Base):
    __tablename__ = "itinerary_templates"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    destination_id: Mapped[str | None] = mapped_column(ForeignKey("destinations.id", ondelete="SET NULL"))
    slug: Mapped[str] = mapped_column(String(220), unique=True, index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(260), nullable=False)
    days: Mapped[int] = mapped_column(nullable=False)
    budget_level: Mapped[str | None] = mapped_column(String(64))
    traveler_type: Mapped[str | None] = mapped_column(String(80))
    plan_json: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )

    destination: Mapped[Destination | None] = relationship(back_populates="itinerary_templates")


class SavedItinerary(Base):
    __tablename__ = "saved_itineraries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    owner_user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(260), nullable=False)
    destination: Mapped[str] = mapped_column(String(180), nullable=False)
    days: Mapped[int] = mapped_column(nullable=False)
    request_json: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False, default=dict)
    plan_json: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False, default=dict)
    citations: Mapped[list[dict[str, object]]] = mapped_column(JSON, nullable=False, default=list)
    source_chunks: Mapped[list[dict[str, object]]] = mapped_column(JSON, nullable=False, default=list)
    share_id: Mapped[str | None] = mapped_column(String(64), unique=True, index=True)
    is_shared: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )
