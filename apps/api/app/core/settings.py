from functools import lru_cache
from pathlib import Path
from typing import Literal
from urllib.parse import urlparse

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

AppEnv = Literal["local", "test", "staging", "production"]
ProviderName = Literal["openai", "disabled"]
MapProvider = Literal["osm", "mapbox"]
ObjectStorageProvider = Literal["r2", "minio", "local"]
VectorDbProvider = Literal["qdrant", "pgvector"]
EmailProvider = Literal["resend", "disabled"]

UNSAFE_SECRET_DEFAULTS = {"", "change-me", "changeme", "secret", "dev-secret"}
PRODUCTION_ENVS = {"staging", "production"}
PROJECT_ROOT = Path(__file__).resolve().parents[4]


def _split_csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(PROJECT_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        validate_default=True,
    )

    app_env: AppEnv = "local"
    app_name: str = "TravelAssistant"
    app_version: str = "0.1.0"
    public_app_url: str = "http://localhost:3000"
    api_base_url: str = "http://localhost:8000"
    cors_allowed_origins: str = "http://localhost:3000"
    jwt_secret_key: str = Field(default="change-me", min_length=8)
    jwt_access_token_expire_minutes: int = Field(default=30, ge=5, le=1440)
    jwt_refresh_token_expire_days: int = Field(default=30, ge=1, le=120)
    database_url: str = "postgresql+psycopg://travelassistant:travelassistant@localhost:5432/travelassistant"
    redis_url: str = "redis://localhost:6379/0"
    openai_api_key: str = ""
    default_llm_provider: ProviderName = "openai"
    llm_model: str = "gpt-4.1-nano"
    default_stt_provider: ProviderName = "openai"
    default_tts_provider: ProviderName = "openai"
    embedding_model: str = "text-embedding-3-small"
    embedding_dimensions: int = Field(default=1536, ge=1, le=4096)
    stt_model: str = "whisper-1"
    tts_model: str = "tts-1"
    voice_name: str = "alloy"
    voice_max_audio_bytes: int = Field(default=10_485_760, ge=1, le=26_214_400)
    voice_max_audio_seconds: int = Field(default=300, ge=1, le=1800)
    vector_db_provider: VectorDbProvider = "qdrant"
    qdrant_url: str = "http://localhost:6333"
    qdrant_api_key: str = ""
    qdrant_collection: str = "travelassistant_chunks"
    ivivu_processed_data_path: str = ""
    object_storage_provider: ObjectStorageProvider = "r2"
    media_max_image_bytes: int = Field(default=5_242_880, ge=1, le=20_971_520)
    r2_account_id: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket_name: str = "travelassistant-media"
    r2_public_base_url: str = "https://cdn.example.com"
    map_provider: MapProvider = "osm"
    mapbox_access_token: str = ""
    google_maps_api_key: str = ""
    google_client_id: str = ""
    google_client_secret: str = ""
    google_oauth_redirect_uri: str = ""
    email_provider: EmailProvider = "resend"
    resend_api_key: str = ""
    email_from: str = "no-reply@example.com"
    sentry_dsn: str = ""
    posthog_api_key: str = ""
    posthog_host: str = "https://app.posthog.com"

    @property
    def cors_origins(self) -> list[str]:
        return _split_csv(self.cors_allowed_origins)

    @field_validator("public_app_url", "api_base_url", "qdrant_url", "r2_public_base_url", "posthog_host")
    @classmethod
    def validate_http_url(cls, value: str) -> str:
        parsed = urlparse(value)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("must be an absolute http(s) URL")
        return value

    @field_validator("redis_url")
    @classmethod
    def validate_redis_url(cls, value: str) -> str:
        parsed = urlparse(value)
        if parsed.scheme not in {"redis", "rediss"} or not parsed.netloc:
            raise ValueError("REDIS_URL must use redis:// or rediss://")
        return value

    @field_validator("database_url")
    @classmethod
    def validate_database_url(cls, value: str) -> str:
        parsed = urlparse(value)
        if parsed.scheme not in {"postgresql", "postgresql+psycopg"} or not parsed.netloc:
            raise ValueError("DATABASE_URL must use PostgreSQL")
        return value

    @field_validator("cors_allowed_origins")
    @classmethod
    def validate_cors_allowed_origins(cls, value: str) -> str:
        origins = _split_csv(value)
        if not origins:
            raise ValueError("CORS_ALLOWED_ORIGINS must include at least one origin")

        for origin in origins:
            if origin == "*":
                continue
            parsed = urlparse(origin)
            if parsed.scheme not in {"http", "https"} or not parsed.netloc:
                raise ValueError("CORS origins must be full http(s) origins")
        return ",".join(origins)

    @model_validator(mode="after")
    def reject_unsafe_production_defaults(self) -> "Settings":
        if self.app_env not in PRODUCTION_ENVS:
            return self

        if self.jwt_secret_key.strip().lower() in UNSAFE_SECRET_DEFAULTS:
            raise ValueError("JWT_SECRET_KEY must be changed outside local/test")
        if "*" in self.cors_origins:
            raise ValueError("CORS wildcard is not allowed outside local/test")
        if any("localhost" in origin or "127.0.0.1" in origin for origin in self.cors_origins):
            raise ValueError("CORS_ALLOWED_ORIGINS must not use localhost outside local/test")
        if "localhost" in self.database_url or "127.0.0.1" in self.database_url:
            raise ValueError("DATABASE_URL must not use localhost outside local/test")
        if "localhost" in self.redis_url or "127.0.0.1" in self.redis_url:
            raise ValueError("REDIS_URL must not use localhost outside local/test")

        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
