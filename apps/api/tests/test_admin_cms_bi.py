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
from app.db.session import get_db
from app.main import create_app
from app.models.analytics import ProductEvent
from app.models.auth import AuditLog, User
from app.models.rag import EmbeddingJob


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


def auth_headers(tokens: dict[str, object]) -> dict[str, str]:
    return {"Authorization": f"Bearer {tokens['access_token']}"}


def promote(session_factory: sessionmaker[Session], email: str, role: str = "editor") -> None:
    with session_factory() as db:
        user = db.scalar(select(User).where(User.email == email))
        assert user is not None
        user.role = role
        db.commit()


def test_admin_dashboard_rejects_user_and_handles_empty_data(
    client_and_db: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, session_factory = client_and_db
    user_tokens = register(client, "admin-denied@example.com")
    denied = client.get("/api/v1/admin/dashboard", headers=auth_headers(user_tokens))
    assert denied.status_code == 403

    editor_tokens = register(client, "admin-empty@example.com")
    promote(session_factory, "admin-empty@example.com")
    dashboard = client.get("/api/v1/admin/dashboard", headers=auth_headers(editor_tokens))
    assert dashboard.status_code == 200
    payload = dashboard.json()
    assert payload["metrics"]
    assert payload["top_destinations"] == []
    assert payload["top_intents"] == []
    assert payload["feedback"] == []


def test_event_ingestion_and_bi_rollup(client_and_db: tuple[TestClient, sessionmaker[Session]]) -> None:
    client, session_factory = client_and_db
    user_tokens = register(client, "event-user@example.com")
    headers = auth_headers(user_tokens)
    event = client.post(
        "/api/v1/events",
        headers=headers,
        json={
            "event_name": "chat_submit",
            "intent": "family_itinerary",
            "destination_slug": "da-nang",
            "latency_ms": 321,
            "cost_usd": 0.001,
            "metadata_json": {"surface": "chat"},
        },
    )
    assert event.status_code == 201

    with session_factory() as db:
        stored = db.scalar(select(ProductEvent).where(ProductEvent.event_name == "chat_submit"))
    assert stored is not None
    assert stored.destination_slug == "da-nang"

    editor_tokens = register(client, "event-editor@example.com")
    promote(session_factory, "event-editor@example.com")
    dashboard = client.get("/api/v1/admin/dashboard", headers=auth_headers(editor_tokens))
    assert dashboard.status_code == 200
    assert dashboard.json()["top_destinations"] == [{"key": "da-nang", "count": 1}]
    assert dashboard.json()["top_intents"] == [{"key": "family_itinerary", "count": 1}]


def test_admin_cms_publish_queues_reindex_and_audit_log(
    client_and_db: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, session_factory = client_and_db
    editor_tokens = register(client, "cms-editor@example.com")
    headers = auth_headers(editor_tokens)
    promote(session_factory, "cms-editor@example.com")

    destination = client.post(
        "/api/v1/admin/destinations",
        headers=headers,
        json={
            "slug": "quy-nhon",
            "name": "Quy Nhon",
            "region": "Mien Trung",
            "summary": "Thanh pho bien phu hop cho ky nghi ngan.",
            "status": "draft",
        },
    )
    assert destination.status_code == 201
    destination_id = destination.json()["id"]

    published = client.post(f"/api/v1/admin/destination/{destination_id}/publish", headers=headers)
    assert published.status_code == 200
    assert published.json()["status"] == "published"

    with session_factory() as db:
        actions = {log.action for log in db.scalars(select(AuditLog)).all()}
        job = db.scalar(select(EmbeddingJob))
    assert "cms.destination.publish" in actions
    assert "rag.reindex.queued" in actions
    assert job is not None
    assert job.status == "queued"


def test_admin_tags_and_templates_crud(client_and_db: tuple[TestClient, sessionmaker[Session]]) -> None:
    client, session_factory = client_and_db
    editor_tokens = register(client, "tag-template-editor@example.com")
    headers = auth_headers(editor_tokens)
    promote(session_factory, "tag-template-editor@example.com")

    tag = client.post("/api/v1/admin/tags", headers=headers, json={"slug": "beach", "name": "Beach"})
    assert tag.status_code == 201
    tag_id = tag.json()["id"]
    renamed = client.put(f"/api/v1/admin/tags/{tag_id}", headers=headers, json={"name": "Beach trip"})
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Beach trip"

    template = client.post(
        "/api/v1/admin/itinerary-templates",
        headers=headers,
        json={
            "slug": "da-nang-family-3d",
            "title": "Da Nang family 3 days",
            "days": 3,
            "plan_json": {"days": []},
            "status": "review",
        },
    )
    assert template.status_code == 201
    assert template.json()["status"] == "review"

    summary = client.get("/api/v1/admin/content/summary", headers=headers)
    assert summary.status_code == 200
    assert summary.json()["tag_count"] == 1
