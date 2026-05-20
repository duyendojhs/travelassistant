from dataclasses import dataclass
from collections import Counter
import unicodedata

from sqlalchemy import or_, select
from sqlalchemy.orm import Session, joinedload

from app.models.rag import RagChunk, RagSource
from app.services.embeddings import EmbeddingProvider
from app.services.vector_store import MetadataFilter, VectorSearchHit, VectorStore


@dataclass(frozen=True)
class RetrievedChunk:
    chunk_id: str
    content: str
    score: float
    source: dict[str, object]


class RetrievalService:
    def __init__(self, embedding_provider: EmbeddingProvider, vector_store: VectorStore) -> None:
        self.embedding_provider = embedding_provider
        self.vector_store = vector_store

    def retrieve(self, db: Session, query: str, limit: int = 5) -> list[RetrievedChunk]:
        vectors = self.embedding_provider.embed_texts([query])
        if not vectors:
            return self._database_fallback(db, query, limit=limit)

        metadata_filter = self._destination_filter(db, query)
        hits = self._search(vectors[0], limit=limit, metadata_filter=metadata_filter)
        if not hits and metadata_filter is not None:
            hits = self._search(vectors[0], limit=limit, metadata_filter=None)
        if not hits:
            return self._database_fallback(db, query, limit=limit)

        chunk_ids = [str(hit.payload.get("chunk_id", "")) for hit in hits if hit.payload.get("chunk_id")]
        chunks = {
            chunk.id: chunk
            for chunk in db.scalars(select(RagChunk).where(RagChunk.id.in_(chunk_ids)))
        }

        results: list[RetrievedChunk] = []
        for hit in hits:
            chunk_id = str(hit.payload.get("chunk_id", ""))
            chunk = chunks.get(chunk_id)
            if chunk is None:
                continue
            results.append(_retrieved_chunk(chunk, hit.score))
        return results or self._database_fallback(db, query, limit=limit)

    def _search(
        self,
        vector: list[float],
        limit: int,
        metadata_filter: MetadataFilter | None,
    ) -> list[VectorSearchHit]:
        try:
            return self.vector_store.search(vector, limit=limit, metadata_filter=metadata_filter)
        except Exception as exc:
            if _is_missing_vector_collection(exc):
                return []
            raise

    def _database_fallback(self, db: Session, query: str, limit: int) -> list[RetrievedChunk]:
        terms = _query_terms(query)
        if not terms:
            return []

        chunks = list(
            db.scalars(
                select(RagChunk)
                .options(joinedload(RagChunk.source))
                .join(RagSource)
                .where(RagSource.status == "published")
                .where(or_(*(RagChunk.content.ilike(f"%{term}%") for term in terms[:5])))
                .order_by(RagChunk.created_at.desc())
                .limit(80)
            )
        )
        scored = sorted(
            ((chunk, _lexical_score(chunk.content, terms)) for chunk in chunks),
            key=lambda item: item[1],
            reverse=True,
        )
        return [_retrieved_chunk(chunk, float(score)) for chunk, score in scored[:limit] if score > 0]

    def _destination_filter(self, db: Session, query: str) -> MetadataFilter | None:
        normalized_query = _normalize(query)
        if len(normalized_query) < 3:
            return None

        destinations: Counter[str] = Counter()
        for metadata in db.scalars(
            select(RagSource.metadata_json).where(RagSource.source_type == "ivivu_article")
        ):
            destination = metadata.get("destination") if isinstance(metadata, dict) else None
            if isinstance(destination, str) and destination.strip():
                destinations[destination.strip()] += 1

        matches = [
            (destination, count)
            for destination, count in destinations.items()
            if len(_normalize(destination)) >= 3 and _normalize(destination) in normalized_query
        ]
        if not matches:
            return None
        destination, _count = max(matches, key=lambda item: (item[1], len(item[0])))
        return {"destination": destination}


def _retrieved_chunk(chunk: RagChunk, score: float) -> RetrievedChunk:
    return RetrievedChunk(
        chunk_id=chunk.id,
        content=chunk.content,
        score=score,
        source={
            "source_type": chunk.source.source_type,
            "source_id": chunk.source.source_id,
            "source_slug": chunk.source.slug,
            "source_title": chunk.source.title,
            "canonical_url": chunk.source.canonical_url,
            "heading_path": chunk.heading_path,
            "metadata": {**chunk.source.metadata_json, **chunk.metadata_json},
        },
    )


def _normalize(value: str) -> str:
    decomposed = unicodedata.normalize("NFD", value.casefold().replace("\u0111", "d"))
    ascii_text = "".join(char for char in decomposed if unicodedata.category(char) != "Mn")
    return " ".join(ascii_text.split())


def _query_terms(query: str) -> list[str]:
    stop_words = {"toi", "minh", "ban", "cho", "hoi", "noi", "ve", "la", "di", "du", "lich", "trinh"}
    terms = []
    for term in _normalize(query).split():
        if len(term) >= 3 and term not in stop_words:
            terms.append(term)
    return list(dict.fromkeys(terms))


def _lexical_score(content: str, terms: list[str]) -> int:
    normalized = _normalize(content)
    return sum(normalized.count(term) for term in terms)


def _is_missing_vector_collection(exc: Exception) -> bool:
    message = str(exc).lower()
    return "collection" in message and ("not found" in message or "doesn't exist" in message)
