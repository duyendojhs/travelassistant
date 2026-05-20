from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app import models  # noqa: F401
from app.core.rate_limit import default_rate_limit_store
from app.core.settings import get_settings
from app.db.base import Base
from app.db.seed import seed_content
from app.db.session import get_db
from app.main import create_app
from app.models.analytics import ModelUsage, ProductEvent
from app.models.rag import EmbeddingJob
from app.services.embeddings import DeterministicEmbeddingProvider
from app.services.ingestion import create_embedding_job, run_embedding_job
from app.services.vector_store import InMemoryVectorStore
import app.api.v1.routes.chat as chat_routes
import app.api.v1.routes.itineraries as itinerary_routes


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
    vector_store = InMemoryVectorStore("test_chunks")

    with testing_session_local() as db:
        seed_content(db)
        job = create_embedding_job(
            db=db,
            requested_by_user_id=None,
            provider="disabled",
            embedding_model="test-embedding",
            vector_collection="test_chunks",
        )
        run_embedding_job(db, job, DeterministicEmbeddingProvider(dimensions=8), vector_store)

    monkeypatch.setattr(
        chat_routes,
        "get_embedding_provider",
        lambda settings: DeterministicEmbeddingProvider(model="test-embedding", dimensions=8),
    )
    monkeypatch.setattr(chat_routes, "QdrantVectorStore", lambda settings: vector_store)
    monkeypatch.setattr(
        itinerary_routes,
        "get_embedding_provider",
        lambda settings: DeterministicEmbeddingProvider(model="test-embedding", dimensions=8),
    )
    monkeypatch.setattr(itinerary_routes, "QdrantVectorStore", lambda settings: vector_store)

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


def auth_headers(tokens: dict[str, object]) -> dict[str, str]:
    return {"Authorization": f"Bearer {tokens['access_token']}"}


def test_chat_session_isolation_citations_idempotency_stream_and_feedback(
    client_and_db: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, session_factory = client_and_db
    user_a = register(client, "chat-a@example.com")
    user_b = register(client, "chat-b@example.com")
    headers_a = auth_headers(user_a)
    headers_b = auth_headers(user_b)

    created = client.post("/api/v1/chat/sessions", headers=headers_a, json={"title": "Đà Nẵng"})
    assert created.status_code == 201
    session_id = created.json()["id"]

    denied = client.get(f"/api/v1/chat/sessions/{session_id}", headers=headers_b)
    assert denied.status_code == 404

    payload = {
        "content": "Gợi ý lịch trình Đà Nẵng 3 ngày",
        "idempotency_key": "same-request-001",
    }
    first = client.post(f"/api/v1/chat/sessions/{session_id}/messages", headers=headers_a, json=payload)
    assert first.status_code == 201
    first_payload = first.json()
    assistant = first_payload["assistant_message"]
    assert assistant["citations"]
    assert assistant["source_chunks"]
    assert assistant["model_provider"].startswith("disabled:")

    second = client.post(f"/api/v1/chat/sessions/{session_id}/messages", headers=headers_a, json=payload)
    assert second.status_code == 201
    assert second.json()["assistant_message"]["id"] == assistant["id"]

    stream = client.post(
        f"/api/v1/chat/sessions/{session_id}/stream",
        headers=headers_a,
        json={"content": "Ăn gì ở Đà Nẵng?", "idempotency_key": "stream-request-001"},
    )
    assert stream.status_code == 200
    assert "text/event-stream" in stream.headers["content-type"]
    assert "event: metadata" in stream.text
    assert "event: done" in stream.text

    feedback = client.post(
        "/api/v1/chat/feedback",
        headers=headers_a,
        json={"message_id": assistant["id"], "feedback_state": "helpful"},
    )
    assert feedback.status_code == 200
    assert feedback.json()["feedback_state"] == "helpful"

    with session_factory() as db:
        assert db.scalar(select(EmbeddingJob)).status == "completed"
        assert db.scalar(select(ModelUsage).where(ModelUsage.feature == "chat")) is not None
        assert db.scalar(select(ProductEvent).where(ProductEvent.event_name == "chat_message")) is not None


def test_itinerary_generation_save_share_and_schema(client_and_db: tuple[TestClient, sessionmaker[Session]]) -> None:
    client, session_factory = client_and_db
    user = register(client, "itinerary@example.com")
    headers = auth_headers(user)

    generated = client.post(
        "/api/v1/itineraries/generate",
        headers=headers,
        json={
            "destination": "Đà Nẵng",
            "days": 2,
            "interests": ["ẩm thực", "biển"],
            "budget": "mid-range",
            "travelers": 2,
        },
    )
    assert generated.status_code == 201
    itinerary = generated.json()
    assert itinerary["plan_json"]["days"]
    assert itinerary["plan_json"]["days"][0]["blocks"]
    assert itinerary["citations"]

    listed = client.get("/api/v1/itineraries", headers=headers)
    assert listed.status_code == 200
    assert listed.json()[0]["id"] == itinerary["id"]

    shared = client.post(f"/api/v1/itineraries/{itinerary['id']}/share", headers=headers)
    assert shared.status_code == 200
    share_id = shared.json()["share_id"]
    assert share_id

    public = client.get(f"/api/v1/shared/itineraries/{share_id}")
    assert public.status_code == 200
    assert public.json()["id"] == itinerary["id"]

    with session_factory() as db:
        assert db.scalar(select(ModelUsage).where(ModelUsage.feature == "itinerary")) is not None
        assert db.scalar(select(ProductEvent).where(ProductEvent.event_name == "itinerary_generate")) is not None
