from collections.abc import Generator
import base64
from io import BytesIO
from pathlib import Path
import wave

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app import models  # noqa: F401
from app.api.v1.routes import content as content_routes
from app.api.v1.routes import voice as voice_routes
from app.core.rate_limit import default_rate_limit_store
from app.core.settings import get_settings
from app.db.base import Base
from app.db.seed import seed_content
from app.db.session import get_db
from app.main import create_app
from app.services.embeddings import DeterministicEmbeddingProvider
from app.services.ingestion import create_embedding_job, run_embedding_job
from app.services.storage import LocalAudioStorage, LocalImageStorage
from app.services.vector_store import InMemoryVectorStore

PNG_1X1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="
)


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Generator[TestClient, None, None]:
    monkeypatch.setenv("JWT_SECRET_KEY", "test-secret-key-with-enough-length")
    monkeypatch.setenv("DEFAULT_LLM_PROVIDER", "disabled")
    monkeypatch.setenv("DEFAULT_STT_PROVIDER", "disabled")
    monkeypatch.setenv("DEFAULT_TTS_PROVIDER", "disabled")
    monkeypatch.setenv("EMBEDDING_DIMENSIONS", "8")
    monkeypatch.setenv("R2_PUBLIC_BASE_URL", "http://localhost/uploads")
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
        voice_routes,
        "get_embedding_provider",
        lambda settings: DeterministicEmbeddingProvider(model="test-embedding", dimensions=8),
    )
    monkeypatch.setattr(voice_routes, "QdrantVectorStore", lambda settings: vector_store)
    monkeypatch.setattr(
        voice_routes,
        "LocalAudioStorage",
        lambda settings: LocalAudioStorage(settings, root=tmp_path / "audio"),
    )
    monkeypatch.setattr(
        content_routes,
        "LocalImageStorage",
        lambda settings: LocalImageStorage(settings, root=tmp_path / "images"),
    )

    app = create_app()

    def override_get_db() -> Generator[Session, None, None]:
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


def _auth_headers(client: TestClient) -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/register",
        json={"email": "voice-image@example.com", "password": "a-strong-local-password"},
    )
    assert response.status_code == 201
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _wav_bytes() -> bytes:
    buffer = BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(16000)
        wav.writeframes(b"\x00\x00" * 1600)
    return buffer.getvalue()


def test_voice_stt_tts_query_and_status(client: TestClient) -> None:
    headers = _auth_headers(client)
    audio = _wav_bytes()

    stt = client.post(
        "/api/v1/voice/stt",
        headers=headers,
        files={"file": ("query.wav", audio, "audio/wav")},
    )
    assert stt.status_code == 200
    assert stt.json()["transcript"] == "Goi y lich trinh Da Nang 3 ngay"
    assert [event["status"] for event in stt.json()["job"]["events"]] == ["uploaded", "transcribing", "done"]

    tts = client.post("/api/v1/voice/tts", headers=headers, json={"text": "Xin chao"})
    assert tts.status_code == 200
    assert tts.json()["object_key"].startswith("audio/")
    assert tts.json()["mime_type"] == "audio/wav"

    query = client.post(
        "/api/v1/voice/query",
        headers=headers,
        files={"file": ("query.wav", audio, "audio/wav")},
    )
    assert query.status_code == 200
    payload = query.json()
    assert payload["status"] == "done"
    assert payload["transcript"] == "Goi y lich trinh Da Nang 3 ngay"
    assert payload["answer"]
    assert payload["output_object_key"].startswith("audio/")
    assert [event["status"] for event in payload["events"]] == [
        "uploaded",
        "transcribing",
        "retrieving",
        "generating",
        "speaking",
        "done",
    ]

    status_response = client.get(f"/api/v1/voice/status/{payload['id']}", headers=headers)
    assert status_response.status_code == 200
    assert status_response.json()["id"] == payload["id"]


def test_voice_query_accepts_browser_webm_codec_mime(client: TestClient) -> None:
    headers = _auth_headers(client)

    response = client.post(
        "/api/v1/voice/query",
        headers=headers,
        files={"file": ("recording.webm", b"webm audio bytes", "audio/webm;codecs=opus")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["mime_type"] == "audio/webm"
    assert payload["input_object_key"].endswith(".webm")


def test_voice_query_rejects_empty_transcript(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class EmptySpeechProvider:
        provider = "disabled"
        stt_model = "empty-stt"
        tts_model = "empty-tts"

        def transcribe(self, content: bytes, *, filename: str, mime_type: str) -> str:
            return ""

        def synthesize(self, text: str) -> bytes:
            return _wav_bytes()

    monkeypatch.setattr(voice_routes, "get_speech_provider", lambda settings: EmptySpeechProvider())
    headers = _auth_headers(client)

    response = client.post(
        "/api/v1/voice/query",
        headers=headers,
        files={"file": ("query.wav", _wav_bytes(), "audio/wav")},
    )

    assert response.status_code == 422
    assert "Không nghe thấy" in response.json()["message"]


def test_image_upload_and_analyze(client: TestClient) -> None:
    headers = _auth_headers(client)

    upload = client.post(
        "/api/v1/images/upload",
        headers=headers,
        files={"file": ("photo.png", PNG_1X1, "image/png")},
        data={"alt_text": "test photo"},
    )
    assert upload.status_code == 201
    image = upload.json()
    assert image["object_key"].startswith("images/")
    assert "D:\\" not in image["public_url"]
    assert image["width"] == 1
    assert image["height"] == 1

    analysis = client.post("/api/v1/images/analyze", headers=headers, json={"image_id": image["id"]})
    assert analysis.status_code == 200
    payload = analysis.json()
    assert payload["image_id"] == image["id"]
    assert payload["provider"] == "disabled"
    assert payload["analysis"]["labels"] == ["travel", "uploaded_image"]
