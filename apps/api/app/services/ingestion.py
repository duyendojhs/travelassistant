from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import delete, select
from sqlalchemy.orm import Session, joinedload

from app.models.content import Article, Destination, Place
from app.models.rag import EmbeddingJob, RagChunk, RagSource
from app.services.chunking import chunk_text, clean_text
from app.services.embeddings import EmbeddingProvider
from app.services.vector_store import VectorPoint, VectorStore

EMBEDDING_BATCH_SIZE = 128


@dataclass(frozen=True)
class IngestionResult:
    job_id: str
    status: str
    total_chunks: int
    indexed_chunks: int
    vector_collection: str


@dataclass(frozen=True)
class SourceDocument:
    source_type: str
    source_id: str
    slug: str
    title: str
    summary: str | None
    body: str
    canonical_url: str | None
    metadata: dict[str, object]
    heading_path: list[str]


def _upsert_source(db: Session, document: SourceDocument) -> RagSource:
    source = db.scalar(
        select(RagSource).where(
            RagSource.source_type == document.source_type,
            RagSource.source_id == document.source_id,
        )
    )
    if source is None:
        source = RagSource(
            source_type=document.source_type,
            source_id=document.source_id,
            slug=document.slug,
            title=document.title,
        )
        db.add(source)
        db.flush()

    source.slug = document.slug
    source.title = document.title
    source.summary = document.summary
    source.canonical_url = document.canonical_url
    source.status = "published"
    source.metadata_json = document.metadata
    return source


def _documents(db: Session) -> list[SourceDocument]:
    destinations = list(
        db.scalars(select(Destination).where(Destination.status == "published").order_by(Destination.updated_at))
    )
    places = list(db.scalars(select(Place).where(Place.status == "published").order_by(Place.updated_at)))
    articles = list(db.scalars(select(Article).where(Article.status == "published").order_by(Article.updated_at)))

    documents: list[SourceDocument] = []
    documents.extend(
        SourceDocument(
            source_type="destination",
            source_id=destination.id,
            slug=destination.slug,
            title=destination.name,
            summary=destination.summary,
            body=clean_text(f"{destination.name}\n{destination.summary}\n{destination.description or ''}"),
            canonical_url=f"/destinations/{destination.slug}",
            metadata={
                "region": destination.region,
                "latitude": destination.latitude,
                "longitude": destination.longitude,
            },
            heading_path=["Destination", destination.name],
        )
        for destination in destinations
    )
    documents.extend(
        SourceDocument(
            source_type="place",
            source_id=place.id,
            slug=place.slug,
            title=place.name,
            summary=place.summary,
            body=clean_text(f"{place.name}\n{place.kind}\n{place.summary}\n{place.address or ''}"),
            canonical_url=f"/places/{place.id}",
            metadata={
                "destination_id": place.destination_id,
                "kind": place.kind,
                "price_level": place.price_level,
                **place.metadata_json,
            },
            heading_path=["Place", place.kind, place.name],
        )
        for place in places
    )
    documents.extend(
        SourceDocument(
            source_type="article",
            source_id=article.id,
            slug=article.slug,
            title=article.title,
            summary=article.excerpt,
            body=clean_text(f"{article.title}\n{article.excerpt}\n{article.body}"),
            canonical_url=f"/articles/{article.slug}",
            metadata={
                "destination_id": article.destination_id,
                "source_url": article.source_url,
            },
            heading_path=["Article", article.title],
        )
        for article in articles
    )
    return documents


def prepare_rag_chunks(db: Session, document: SourceDocument) -> list[RagChunk]:
    source = _upsert_source(db, document)
    db.execute(delete(RagChunk).where(RagChunk.source_id == source.id))
    records: list[RagChunk] = []
    for index, content in enumerate(chunk_text(document.body)):
        chunk = RagChunk(
            source_id=source.id,
            point_id=str(uuid4()),
            chunk_index=index,
            chunk_type="body",
            heading_path=document.heading_path,
            content=content,
            token_estimate=max(1, len(content) // 4),
            char_start=None,
            char_end=None,
            metadata_json=document.metadata,
        )
        db.add(chunk)
        records.append(chunk)
    db.flush()
    return records


def run_embedding_job(
    db: Session,
    job: EmbeddingJob,
    embedding_provider: EmbeddingProvider,
    vector_store: VectorStore,
) -> IngestionResult:
    job.status = "running"
    job.started_at = datetime.now(timezone.utc)
    db.flush()

    try:
        for document in _documents(db):
            prepare_rag_chunks(db, document)

        chunks = list(
            db.scalars(
                select(RagChunk)
                .options(joinedload(RagChunk.source))
                .join(RagSource)
                .where(RagSource.status == "published")
                .order_by(RagSource.source_type, RagSource.title, RagChunk.chunk_index)
            )
        )
        job.total_chunks = len(chunks)
        job.indexed_chunks = 0
        vector_store.recreate_collection(embedding_provider.dimensions)
        now = datetime.now(timezone.utc)
        job.vector_collection = vector_store.collection_name

        for batch_number, start in enumerate(range(0, len(chunks), EMBEDDING_BATCH_SIZE), start=1):
            batch = chunks[start : start + EMBEDDING_BATCH_SIZE]
            vectors = embedding_provider.embed_texts([chunk.content for chunk in batch])
            points: list[VectorPoint] = []
            for chunk, vector in zip(batch, vectors):
                if chunk.point_id is None:
                    chunk.point_id = str(uuid4())
                chunk.embedding_model = embedding_provider.model
                chunk.vector_collection = vector_store.collection_name
                chunk.embedded_at = now
                points.append(
                    VectorPoint(
                        point_id=chunk.point_id,
                        vector=vector,
                        payload={
                            "chunk_id": chunk.id,
                            "rag_source_id": chunk.source_id,
                            "source_type": chunk.source.source_type,
                            "source_id": chunk.source.source_id,
                            "source_slug": chunk.source.slug,
                            "source_title": chunk.source.title,
                            "canonical_url": chunk.source.canonical_url or "",
                            "heading_path": chunk.heading_path,
                            "content": chunk.content,
                            "metadata": chunk.metadata_json,
                        },
                    )
                )

            vector_store.upsert(points)
            job.indexed_chunks += len(points)
            db.flush()
            if batch_number == 1 or batch_number % 10 == 0 or job.indexed_chunks == job.total_chunks:
                print(f"INFO: embedding progress {job.indexed_chunks}/{job.total_chunks}")

        job.status = "completed"
        job.finished_at = datetime.now(timezone.utc)
        db.commit()
    except Exception as exc:
        job.status = "failed"
        job.error_message = str(exc)
        job.finished_at = datetime.now(timezone.utc)
        db.commit()
        raise

    return IngestionResult(
        job_id=job.id,
        status=job.status,
        total_chunks=job.total_chunks,
        indexed_chunks=job.indexed_chunks,
        vector_collection=job.vector_collection,
    )


def create_embedding_job(
    db: Session,
    requested_by_user_id: str | None,
    provider: str,
    embedding_model: str,
    vector_collection: str,
) -> EmbeddingJob:
    job = EmbeddingJob(
        requested_by_user_id=requested_by_user_id,
        provider=provider,
        embedding_model=embedding_model,
        vector_collection=vector_collection,
        status="queued",
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job
