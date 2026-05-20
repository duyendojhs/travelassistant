from dataclasses import dataclass
from typing import Any, Protocol

from qdrant_client import QdrantClient, models

from app.core.settings import Settings

MetadataFilter = dict[str, str | int | bool]


@dataclass(frozen=True)
class VectorPoint:
    point_id: str
    vector: list[float]
    payload: dict[str, object]


@dataclass(frozen=True)
class VectorSearchHit:
    point_id: str
    score: float
    payload: dict[str, object]


class VectorStore(Protocol):
    collection_name: str

    def ensure_collection(self, dimensions: int) -> None:
        """Create the target collection if it does not exist."""

    def recreate_collection(self, dimensions: int) -> None:
        """Replace the target collection for a clean full reindex."""

    def upsert(self, points: list[VectorPoint]) -> None:
        """Upsert vector points."""

    def search(
        self,
        vector: list[float],
        limit: int,
        metadata_filter: MetadataFilter | None = None,
    ) -> list[VectorSearchHit]:
        """Return nearest vector hits."""


class QdrantVectorStore:
    def __init__(self, settings: Settings) -> None:
        self.collection_name = settings.qdrant_collection
        self._client = QdrantClient(
            url=settings.qdrant_url,
            api_key=settings.qdrant_api_key or None,
        )

    def ensure_collection(self, dimensions: int) -> None:
        if self._client.collection_exists(self.collection_name):
            return
        self._client.create_collection(
            collection_name=self.collection_name,
            vectors_config=models.VectorParams(size=dimensions, distance=models.Distance.COSINE),
        )

    def recreate_collection(self, dimensions: int) -> None:
        if self._client.collection_exists(self.collection_name):
            self._client.delete_collection(collection_name=self.collection_name)
        self._client.create_collection(
            collection_name=self.collection_name,
            vectors_config=models.VectorParams(size=dimensions, distance=models.Distance.COSINE),
        )

    def upsert(self, points: list[VectorPoint]) -> None:
        if not points:
            return
        self._client.upsert(
            collection_name=self.collection_name,
            points=[
                models.PointStruct(id=point.point_id, vector=point.vector, payload=point.payload)
                for point in points
            ],
            wait=True,
        )

    def search(
        self,
        vector: list[float],
        limit: int,
        metadata_filter: MetadataFilter | None = None,
    ) -> list[VectorSearchHit]:
        query_filter = None
        if metadata_filter:
            query_filter = models.Filter(
                must=[
                    models.FieldCondition(
                        key=f"metadata.{key}",
                        match=models.MatchValue(value=value),
                    )
                    for key, value in metadata_filter.items()
                ]
            )
        response = self._client.query_points(
            collection_name=self.collection_name,
            query=vector,
            limit=limit,
            query_filter=query_filter,
            with_payload=True,
        )
        return [
            VectorSearchHit(
                point_id=str(point.id),
                score=float(point.score),
                payload=dict(point.payload or {}),
            )
            for point in response.points
        ]


class InMemoryVectorStore:
    def __init__(self, collection_name: str = "test_collection") -> None:
        self.collection_name = collection_name
        self.points: dict[str, VectorPoint] = {}

    def ensure_collection(self, dimensions: int) -> None:
        return None

    def recreate_collection(self, dimensions: int) -> None:
        self.points.clear()

    def upsert(self, points: list[VectorPoint]) -> None:
        for point in points:
            self.points[point.point_id] = point

    def search(
        self,
        vector: list[float],
        limit: int,
        metadata_filter: MetadataFilter | None = None,
    ) -> list[VectorSearchHit]:
        scored: list[VectorSearchHit] = []
        for point in self.points.values():
            metadata = point.payload.get("metadata")
            if metadata_filter:
                if not isinstance(metadata, dict):
                    continue
                if any(metadata.get(key) != value for key, value in metadata_filter.items()):
                    continue
            score = _cosine_similarity(vector, point.vector)
            scored.append(VectorSearchHit(point_id=point.point_id, score=score, payload=point.payload))
        return sorted(scored, key=lambda item: item.score, reverse=True)[:limit]


def _cosine_similarity(left: list[float], right: list[float]) -> float:
    numerator = sum(a * b for a, b in zip(left, right))
    left_norm = sum(a * a for a in left) ** 0.5
    right_norm = sum(b * b for b in right) ** 0.5
    if left_norm == 0 or right_norm == 0:
        return 0.0
    return numerator / (left_norm * right_norm)


def safe_payload(value: Any) -> dict[str, object]:
    if isinstance(value, dict):
        return {str(key): item for key, item in value.items()}
    return {}
