from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status

from app.core.settings import Settings

ALLOWED_IMAGE_MIME_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}

ALLOWED_AUDIO_MIME_TYPES = {
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/webm": ".webm",
    "audio/ogg": ".ogg",
    "audio/mp4": ".m4a",
    "audio/x-m4a": ".m4a",
    "video/webm": ".webm",
}


@dataclass(frozen=True)
class StoredObject:
    object_key: str
    public_url: str
    byte_size: int
    mime_type: str
    width: int | None = None
    height: int | None = None


class LocalImageStorage:
    def __init__(self, settings: Settings, root: Path | None = None) -> None:
        self.settings = settings
        self.root = root or Path("data/uploads/images")

    async def save_image(self, upload: UploadFile) -> StoredObject:
        mime_type = upload.content_type or ""
        extension = ALLOWED_IMAGE_MIME_TYPES.get(mime_type)
        if extension is None:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail="Unsupported image MIME type",
            )

        content = await upload.read()
        if not content:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty image upload")
        if len(content) > self.settings.media_max_image_bytes:
            raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Image is too large")
        width, height = _inspect_image(content, mime_type)

        object_key = f"images/{uuid4().hex}{extension}"
        target = self.root / object_key
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        public_url = f"{self.settings.r2_public_base_url.rstrip('/')}/{object_key}"
        return StoredObject(
            object_key=object_key,
            public_url=public_url,
            byte_size=len(content),
            mime_type=mime_type,
            width=width,
            height=height,
        )

    def resolve_object_key(self, object_key: str) -> Path:
        target = self.root / object_key
        root = self.root.resolve()
        resolved = target.resolve()
        if not resolved.is_relative_to(root):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid object key")
        return resolved


def _inspect_image(content: bytes, mime_type: str) -> tuple[int | None, int | None]:
    dimensions = _png_dimensions(content) if mime_type == "image/png" else None
    if mime_type == "image/jpeg":
        dimensions = _jpeg_dimensions(content)
    if mime_type == "image/webp":
        dimensions = _webp_dimensions(content)
    if dimensions is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid image content")
    return dimensions


def _png_dimensions(content: bytes) -> tuple[int, int] | None:
    if len(content) < 24 or not content.startswith(b"\x89PNG\r\n\x1a\n"):
        return None
    width = int.from_bytes(content[16:20], "big")
    height = int.from_bytes(content[20:24], "big")
    if width <= 0 or height <= 0:
        return None
    return width, height


def _jpeg_dimensions(content: bytes) -> tuple[int, int] | None:
    if len(content) < 4 or not content.startswith(b"\xff\xd8"):
        return None
    index = 2
    start_of_frame_markers = {
        0xC0,
        0xC1,
        0xC2,
        0xC3,
        0xC5,
        0xC6,
        0xC7,
        0xC9,
        0xCA,
        0xCB,
        0xCD,
        0xCE,
        0xCF,
    }
    while index + 9 < len(content):
        if content[index] != 0xFF:
            index += 1
            continue
        while index < len(content) and content[index] == 0xFF:
            index += 1
        if index >= len(content):
            return None
        marker = content[index]
        index += 1
        if marker in {0xD8, 0xD9}:
            continue
        if index + 2 > len(content):
            return None
        segment_length = int.from_bytes(content[index : index + 2], "big")
        if segment_length < 2 or index + segment_length > len(content):
            return None
        if marker in start_of_frame_markers and segment_length >= 7:
            height = int.from_bytes(content[index + 3 : index + 5], "big")
            width = int.from_bytes(content[index + 5 : index + 7], "big")
            if width > 0 and height > 0:
                return width, height
            return None
        index += segment_length
    return None


def _webp_dimensions(content: bytes) -> tuple[int, int] | None:
    if len(content) < 30 or not content.startswith(b"RIFF") or content[8:12] != b"WEBP":
        return None
    chunk_type = content[12:16]
    if chunk_type == b"VP8X" and len(content) >= 30:
        width = 1 + int.from_bytes(content[24:27], "little")
        height = 1 + int.from_bytes(content[27:30], "little")
        return width, height
    if chunk_type == b"VP8L" and len(content) >= 25 and content[20] == 0x2F:
        bits = int.from_bytes(content[21:25], "little")
        width = (bits & 0x3FFF) + 1
        height = ((bits >> 14) & 0x3FFF) + 1
        return width, height
    if chunk_type == b"VP8 " and len(content) >= 30:
        width = int.from_bytes(content[26:28], "little") & 0x3FFF
        height = int.from_bytes(content[28:30], "little") & 0x3FFF
        if width > 0 and height > 0:
            return width, height
    return None


class LocalAudioStorage:
    def __init__(self, settings: Settings, root: Path | None = None) -> None:
        self.settings = settings
        self.root = root or Path("data/uploads")

    async def save_audio(self, upload: UploadFile) -> StoredObject:
        mime_type = _normalize_mime_type(upload.content_type or "")
        extension = ALLOWED_AUDIO_MIME_TYPES.get(mime_type)
        if extension is None:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail=f"Unsupported audio MIME type: {upload.content_type or 'unknown'}",
            )

        content = await upload.read()
        return self.save_audio_bytes(content, mime_type=mime_type, extension=extension)

    def save_audio_bytes(self, content: bytes, *, mime_type: str, extension: str) -> StoredObject:
        if not content:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty audio")
        if len(content) > self.settings.voice_max_audio_bytes:
            raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Audio is too large")

        object_key = f"audio/{uuid4().hex}{extension}"
        target = self.root / object_key
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        public_url = f"{self.settings.r2_public_base_url.rstrip('/')}/{object_key}"
        return StoredObject(
            object_key=object_key,
            public_url=public_url,
            byte_size=len(content),
            mime_type=mime_type,
        )

    def resolve_object_key(self, object_key: str) -> Path:
        target = self.root / object_key
        root = self.root.resolve()
        resolved = target.resolve()
        if not resolved.is_relative_to(root):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid object key")
        return resolved


def _normalize_mime_type(mime_type: str) -> str:
    return mime_type.split(";", 1)[0].strip().lower()
