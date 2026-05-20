from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app import models  # noqa: F401
from app.core.rate_limit import default_rate_limit_store
from app.core.settings import get_settings
from app.db.base import Base
from app.db.seed import seed_content
from app.db.session import get_db
from app.main import create_app
from app.models.auth import User
from app.models.rag import EmbeddingJob, RagChunk, RagSource
from app.services.ivivu_import import import_ivivu_jsonl
from app.services.embeddings import DeterministicEmbeddingProvider
from app.services.vector_store import InMemoryVectorStore
import app.api.v1.routes.dataops as dataops_routes


@pytest.fixture()
def client_and_db(monkeypatch: pytest.MonkeyPatch) -> Generator[tuple[TestClient, sessionmaker[Session]], None, None]:
    monkeypatch.setenv("JWT_SECRET_KEY", "test-secret-key-with-enough-length")
    monkeypatch.setenv("DEFAULT_LLM_PROVIDER", "disabled")
    monkeypatch.setenv("EMBEDDING_DIMENSIONS", "8")
    default_rate_limit_store.clear()
    get_settings.cache_clear()
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    testing_session_local = sessionmaker(
        bind=engine,
        autoflush=False,
        autocommit=False,
        expire_on_commit=False,
    )
    Base.metadata.create_all(bind=engine)
    app = create_app()

    def override_get_db() -> Generator[Session, None, None]:
        db = testing_session_local()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    try:
        yield TestClient(app), testing_session_local
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=engine)
        default_rate_limit_store.clear()
        get_settings.cache_clear()


def register(client: TestClient, email: str) -> dict[str, object]:
    response = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "a-strong-local-password"},
    )
    assert response.status_code == 201
    return response.json()


def promote_to_editor(session_factory: sessionmaker[Session], email: str) -> None:
    with session_factory() as db:
        user = db.scalar(select(User).where(User.email == email))
        assert user is not None
        user.role = "editor"
        seed_content(db)
        db.commit()


def test_embedding_job_indexes_seed_chunks_and_retrieves_sources(
    client_and_db: tuple[TestClient, sessionmaker[Session]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, session_factory = client_and_db
    tokens = register(client, "editor-rag@example.com")
    promote_to_editor(session_factory, "editor-rag@example.com")
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    vector_store = InMemoryVectorStore("test_chunks")

    monkeypatch.setattr(
        dataops_routes,
        "get_embedding_provider",
        lambda settings: DeterministicEmbeddingProvider(model="test-embedding", dimensions=8),
    )
    monkeypatch.setattr(dataops_routes, "QdrantVectorStore", lambda settings: vector_store)

    response = client.post("/api/v1/dataops/embedding-jobs", headers=headers, json={"run_inline": True})

    assert response.status_code == 201
    payload = response.json()
    assert payload["status"] == "completed"
    assert payload["indexed_chunks"] >= 1
    assert payload["vector_collection"] == "test_chunks"

    quality = client.get("/api/v1/dataops/data-quality", headers=headers)
    assert quality.status_code == 200
    assert quality.json()["embedded_chunks"] == payload["indexed_chunks"]
    assert quality.json()["chunks_missing_vectors"] == 0

    preview = client.post(
        "/api/v1/dataops/retrieval-preview",
        headers=headers,
        json={"query": "lịch trình Đà Nẵng", "limit": 3},
    )
    assert preview.status_code == 200
    results = preview.json()
    assert results
    assert results[0]["source"]["source_type"] in {"article", "destination", "place"}
    assert results[0]["source"]["source_title"]
    assert results[0]["source"]["canonical_url"]

    with session_factory() as db:
        job = db.scalar(select(EmbeddingJob))
        chunks = list(db.scalars(select(RagChunk)))
        sources = list(db.scalars(select(RagSource)))
    assert job is not None
    assert job.indexed_chunks == len(chunks)
    assert len(sources) >= 3
    assert all(chunk.embedding_model == "test-embedding" for chunk in chunks)
    assert all(chunk.vector_collection == "test_chunks" for chunk in chunks)


def test_ivivu_import_adds_parent_article_and_keypoint_chunks(
    client_and_db: tuple[TestClient, sessionmaker[Session]],
    tmp_path: Path,
) -> None:
    _client, session_factory = client_and_db
    input_path = tmp_path / "ivivu.jsonl"
    input_path.write_text(
        "\n".join(
            [
                (
                    '{"title":"Cẩm nang Đà Nẵng","time":"2026-04-15",'
                    '"url":"https://example.com/da-nang","destination":"Đà Nẵng",'
                    '"source":"ivivu_blog","keypoint":['
                    '{"idx":{"idx":1,"title":"Sơn Trà","context":"Ngắm biển [img] data/raw/a.jpg [img] buổi sáng."},'
                    '"evaluate":{"mean":4.5,"items":[{},{}]}},'
                    '{"idx":{"idx":2,"title":"Mì Quảng","context":"Nên thử món địa phương."},'
                    '"evaluate":{"mean":4.0,"items":[]}}'
                    "]}"
                )
            ]
        ),
        encoding="utf-8",
    )

    with session_factory() as db:
        result = import_ivivu_jsonl(db, input_path=input_path)
        db.commit()

    assert result.sources_imported == 1
    assert result.chunks_imported == 2

    with session_factory() as db:
        source = db.scalar(select(RagSource).where(RagSource.source_type == "ivivu_article"))
        chunks = list(db.scalars(select(RagChunk).order_by(RagChunk.chunk_index)))

    assert source is not None
    assert source.title == "Cẩm nang Đà Nẵng"
    assert source.canonical_url == "https://example.com/da-nang"
    assert len(chunks) == 2
    assert chunks[0].chunk_type == "keypoint"
    assert chunks[0].metadata_json["images"] == ["data/raw/a.jpg"]
    assert chunks[0].metadata_json["evaluate_count"] == 2


def test_dataops_requires_editor_role(client_and_db: tuple[TestClient, sessionmaker[Session]]) -> None:
    client, _ = client_and_db
    tokens = register(client, "plain-rag@example.com")
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}

    response = client.get("/api/v1/dataops/data-quality", headers=headers)

    assert response.status_code == 403
