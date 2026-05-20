import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.rbac import Role, require_role, role_allows
from app.core.rate_limit import default_rate_limit_store
from app.core.security import hash_password, verify_password
from app.core.settings import get_settings
from app.db.base import Base
from app.db.session import get_db
from app.main import create_app
from app import models  # noqa: F401


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("JWT_SECRET_KEY", "test-secret-key-with-enough-length")
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

    def override_get_db() -> Session:
        db = testing_session_local()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=engine)
        default_rate_limit_store.clear()
        get_settings.cache_clear()


def test_password_hash_verification() -> None:
    password_hash = hash_password("correct horse battery staple")

    assert password_hash != "correct horse battery staple"
    assert verify_password("correct horse battery staple", password_hash)
    assert not verify_password("wrong password", password_hash)


def test_register_login_me_and_account_preferences(client: TestClient) -> None:
    register_response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "Traveler@Example.com",
            "password": "a-strong-local-password",
            "display_name": "Traveler",
        },
    )

    assert register_response.status_code == 201
    registered = register_response.json()
    assert registered["user"]["email"] == "traveler@example.com"
    assert registered["user"]["role"] == "user"
    assert registered["access_token"]
    assert registered["refresh_token"]

    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": "traveler@example.com", "password": "a-strong-local-password"},
    )

    assert login_response.status_code == 200
    login_payload = login_response.json()
    auth_headers = {"Authorization": f"Bearer {login_payload['access_token']}"}

    me_response = client.get("/api/v1/auth/me", headers=auth_headers)
    assert me_response.status_code == 200
    assert me_response.json()["email"] == "traveler@example.com"

    profile_response = client.put(
        "/api/v1/account/profile",
        headers=auth_headers,
        json={"display_name": "Vietnam Traveler", "phone": None, "avatar_url": None},
    )
    assert profile_response.status_code == 200
    assert profile_response.json()["display_name"] == "Vietnam Traveler"

    preferences_response = client.put(
        "/api/v1/account/preferences",
        headers=auth_headers,
        json={
            "home_city": "Da Nang",
            "language": "vi",
            "budget": "mid-range",
            "travel_style": "food and culture",
            "interests": ["street food", "heritage"],
            "constraints": ["avoid long transfers"],
            "wishlist": ["Hoi An"],
            "saved_itinerary_refs": [],
        },
    )
    assert preferences_response.status_code == 200
    assert preferences_response.json()["interests"] == ["street food", "heritage"]
    assert "dietary_goals" not in preferences_response.json()


def test_refresh_token_rotation(client: TestClient) -> None:
    register_response = client.post(
        "/api/v1/auth/register",
        json={"email": "rotate@example.com", "password": "a-strong-local-password"},
    )
    assert register_response.status_code == 201
    first_refresh = register_response.json()["refresh_token"]

    refresh_response = client.post("/api/v1/auth/refresh", json={"refresh_token": first_refresh})
    assert refresh_response.status_code == 200
    second_refresh = refresh_response.json()["refresh_token"]
    assert second_refresh != first_refresh

    reused_response = client.post("/api/v1/auth/refresh", json={"refresh_token": first_refresh})
    assert reused_response.status_code == 401

    second_response = client.post("/api/v1/auth/refresh", json={"refresh_token": second_refresh})
    assert second_response.status_code == 200


def test_role_checks() -> None:
    assert role_allows("admin", Role.editor)
    assert role_allows("root", Role.admin)
    assert not role_allows("user", Role.admin)

    with pytest.raises(HTTPException):
        require_role("user", Role.admin)
