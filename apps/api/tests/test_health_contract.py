import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import create_app
from app.core.settings import Settings, get_settings


@pytest.fixture(autouse=True)
def clear_settings_cache() -> None:
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_health_contract() -> None:
    client = TestClient(create_app())

    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {
        "name": "TravelAssistant",
        "status": "ok",
        "version": "0.1.0",
    }


def test_root_health_contract() -> None:
    client = TestClient(create_app())

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["name"] == "TravelAssistant"


def test_cors_uses_configured_origins(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", "http://localhost:3000,https://example.com")
    client = TestClient(create_app())

    response = client.options(
        "/api/v1/health",
        headers={
            "Origin": "https://example.com",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "https://example.com"


def test_404_uses_structured_error_response() -> None:
    client = TestClient(create_app())

    response = client.get("/missing")

    assert response.status_code == 404
    assert response.json() == {
        "error": "http_error",
        "message": "Not Found",
        "details": None,
    }


def test_production_rejects_unsafe_defaults() -> None:
    with pytest.raises(ValidationError):
        Settings(app_env="production")


def test_production_rejects_wildcard_cors() -> None:
    with pytest.raises(ValidationError):
        Settings(
            app_env="production",
            jwt_secret_key="a-secure-value-for-production",
            database_url="postgresql+psycopg://user:pass@db.example.com:5432/travelassistant",
            redis_url="rediss://redis.example.com:6379/0",
            cors_allowed_origins="*",
        )


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("app_env", "demo"),
        ("database_url", "sqlite:///database.db"),
        ("redis_url", "http://localhost:6379"),
        ("cors_allowed_origins", "localhost:3000"),
    ],
)
def test_settings_reject_invalid_core_values(field: str, value: str) -> None:
    with pytest.raises(ValidationError):
        Settings(**{field: value})


def test_settings_accepts_tls_redis_url() -> None:
    settings = Settings(redis_url="rediss://redis.example.com:6379/0")

    assert settings.redis_url == "rediss://redis.example.com:6379/0"
