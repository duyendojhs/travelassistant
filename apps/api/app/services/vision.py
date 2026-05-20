from __future__ import annotations

import base64
import json
from pathlib import Path
from typing import Protocol

from openai import OpenAI

from app.core.settings import Settings


class VisionProvider(Protocol):
    provider: str
    model: str

    def analyze_image(self, image_path: Path, *, mime_type: str) -> dict[str, object]:
        """Return structured image analysis."""


class MissingVisionProviderKey(RuntimeError):
    pass


class OpenAIVisionProvider:
    def __init__(self, settings: Settings) -> None:
        if not settings.openai_api_key:
            raise MissingVisionProviderKey("OPENAI_API_KEY is required for image analysis")
        self.provider = "openai"
        self.model = settings.llm_model
        self._client = OpenAI(api_key=settings.openai_api_key)

    def analyze_image(self, image_path: Path, *, mime_type: str) -> dict[str, object]:
        encoded = base64.b64encode(image_path.read_bytes()).decode("ascii")
        response = self._client.chat.completions.create(
            model=self.model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Analyze travel images as JSON. Return description, labels, travel_relevance, "
                        "safety_notes, and suggested_query. Do not identify private people."
                    ),
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Analyze this image for a travel assistant."},
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:{mime_type};base64,{encoded}"},
                        },
                    ],
                },
            ],
            temperature=0.1,
            response_format={"type": "json_object"},
        )
        raw = response.choices[0].message.content or "{}"
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}


class DeterministicVisionProvider:
    def __init__(self) -> None:
        self.provider = "disabled"
        self.model = "deterministic-vision"

    def analyze_image(self, image_path: Path, *, mime_type: str) -> dict[str, object]:
        return {
            "description": "A test image was uploaded to the system.",
            "labels": ["travel", "uploaded_image"],
            "travel_relevance": "unknown",
            "safety_notes": [],
            "suggested_query": "Suggest travel places similar to the uploaded image",
        }


def get_vision_provider(settings: Settings) -> VisionProvider:
    if settings.default_llm_provider == "disabled":
        return DeterministicVisionProvider()
    return OpenAIVisionProvider(settings)
