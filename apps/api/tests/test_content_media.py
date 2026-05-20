from collections.abc import Generator
import base64
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy import create_engine

from app import models  # noqa: F401
from app.core.settings import get_settings
from app.core.rate_limit import default_rate_limit_store
from app.db.base import Base
from app.db.seed import seed_content
from app.db.session import get_db
from app.main import create_app
from app.models.auth import AuditLog, User

PNG_1X1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="
)


@pytest.fixture()
def client_and_db(monkeypatch: pytest.MonkeyPatch) -> Generator[tuple[TestClient, sessionmaker[Session]], None, None]:
    monkeypatch.setenv("JWT_SECRET_KEY", "test-secret-key-with-enough-length")
    monkeypatch.setenv("R2_PUBLIC_BASE_URL", "https://cdn.test")
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
        db.commit()


def test_public_destination_article_and_search_endpoints(
    client_and_db: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, session_factory = client_and_db
    with session_factory() as db:
        seed_content(db)

    destinations = client.get("/api/v1/destinations")
    assert destinations.status_code == 200
    assert {item["slug"] for item in destinations.json()} >= {"da-nang", "hoi-an"}

    destination = client.get("/api/v1/destinations/da-nang")
    assert destination.status_code == 200
    assert destination.json()["name"] == "Đà Nẵng"

    places = client.get("/api/v1/destinations/da-nang/places")
    foods = client.get("/api/v1/destinations/da-nang/foods")
    hotels = client.get("/api/v1/destinations/da-nang/hotels")
    assert places.status_code == 200
    assert foods.status_code == 200
    assert hotels.status_code == 200
    assert places.json()[0]["kind"] == "attraction"
    assert foods.json()[0]["kind"] == "restaurant"
    assert hotels.json()[0]["kind"] == "hotel"

    articles = client.get("/api/v1/articles")
    assert articles.status_code == 200
    assert {item["slug"] for item in articles.json()} == {"goi-y-lich-trinh-da-nang-3-ngay"}

    search = client.get("/api/v1/search", params={"q": "Đà Nẵng"})
    assert search.status_code == 200
    assert any(item["type"] == "destination" for item in search.json())


def test_admin_role_enforcement_and_audit_log(client_and_db: tuple[TestClient, sessionmaker[Session]]) -> None:
    client, session_factory = client_and_db
    user_tokens = register(client, "user@example.com")
    user_headers = {"Authorization": f"Bearer {user_tokens['access_token']}"}

    denied = client.post(
        "/api/v1/admin/destinations",
        headers=user_headers,
        json={
            "slug": "hue",
            "name": "Huế",
            "region": "Miền Trung",
            "summary": "Cố đô với di sản, ẩm thực và nhịp sống chậm.",
            "status": "draft",
        },
    )
    assert denied.status_code == 403

    editor_tokens = register(client, "editor@example.com")
    promote_to_editor(session_factory, "editor@example.com")
    editor_headers = {"Authorization": f"Bearer {editor_tokens['access_token']}"}
    created = client.post(
        "/api/v1/admin/destinations",
        headers=editor_headers,
        json={
            "slug": "hue",
            "name": "Huế",
            "region": "Miền Trung",
            "summary": "Cố đô với di sản, ẩm thực và nhịp sống chậm.",
            "status": "draft",
        },
    )

    assert created.status_code == 201
    destination_id = created.json()["id"]

    published = client.post(f"/api/v1/admin/destinations/{destination_id}/publish", headers=editor_headers)
    assert published.status_code == 200
    assert published.json()["status"] == "published"

    with session_factory() as db:
        logs = list(db.scalars(select(AuditLog).where(AuditLog.target_id == destination_id)))
    assert {log.action for log in logs} >= {"cms.destination.create", "cms.destination.publish"}


def test_image_upload_metadata_uses_object_keys_not_local_paths(
    client_and_db: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, _ = client_and_db
    tokens = register(client, "image-owner@example.com")
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    response = client.post(
        "/api/v1/images/upload",
        headers=headers,
        files={"file": ("sample.png", PNG_1X1, "image/png")},
        data={"alt_text": "Ảnh thử nghiệm"},
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["object_key"].startswith("images/")
    assert payload["public_url"].startswith("https://cdn.test/images/")
    assert not Path(payload["object_key"]).is_absolute()
    assert ":\\" not in payload["public_url"]
    assert payload["alt_text"] == "Ảnh thử nghiệm"
    assert payload["width"] == 1
    assert payload["height"] == 1


def test_image_upload_rejects_invalid_mime(client_and_db: tuple[TestClient, sessionmaker[Session]]) -> None:
    client, _ = client_and_db
    tokens = register(client, "invalid-image@example.com")
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}

    response = client.post(
        "/api/v1/images/upload",
        headers=headers,
        files={"file": ("sample.txt", b"not an image", "text/plain")},
    )

    assert response.status_code == 415
