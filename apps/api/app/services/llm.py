from __future__ import annotations

import json
from typing import Protocol

from openai import OpenAI

from app.core.settings import Settings


class LLMProvider(Protocol):
    provider: str
    model: str

    def generate_text(self, system_prompt: str, user_prompt: str) -> str:
        """Generate grounded assistant text."""

    def generate_json(self, system_prompt: str, user_prompt: str) -> dict[str, object]:
        """Generate a JSON object."""


class MissingLLMProviderKey(RuntimeError):
    pass


class OpenAILLMProvider:
    def __init__(self, settings: Settings) -> None:
        if not settings.openai_api_key:
            raise MissingLLMProviderKey("OPENAI_API_KEY is required for live chat generation")
        self.provider = "openai"
        self.model = settings.llm_model
        self._client = OpenAI(api_key=settings.openai_api_key)

    def generate_text(self, system_prompt: str, user_prompt: str) -> str:
        response = self._client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.2,
            max_tokens=700,
        )
        return response.choices[0].message.content or ""

    def generate_json(self, system_prompt: str, user_prompt: str) -> dict[str, object]:
        response = self._client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.1,
            max_tokens=1400,
            response_format={"type": "json_object"},
        )
        raw = response.choices[0].message.content or "{}"
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}


class DeterministicLLMProvider:
    def __init__(self, model: str = "deterministic-llm") -> None:
        self.provider = "disabled"
        self.model = model

    def generate_text(self, system_prompt: str, user_prompt: str) -> str:
        return (
            "Dữ liệu tham khảo hiện có cho thấy có thể trả lời câu hỏi này, "
            "nhưng đây là phản hồi kiểm thử không gọi nhà cung cấp LLM thật. "
            "Vui lòng kiểm tra phần trích dẫn đi kèm để đối chiếu nguồn."
        )

    def generate_json(self, system_prompt: str, user_prompt: str) -> dict[str, object]:
        return {
            "title": "Lịch trình kiểm thử",
            "destination": "Đà Nẵng",
            "days": [
                {
                    "day": 1,
                    "theme": "Khám phá trung tâm",
                    "blocks": [
                        {
                            "time": "morning",
                            "title": "Điểm tham quan chính",
                            "description": "Chọn một điểm phù hợp từ các nguồn tham khảo.",
                            "place_ids": [],
                            "cost_estimate": "not_available",
                            "route_hint": "Sắp xếp các điểm gần nhau để giảm thời gian di chuyển.",
                            "citation_ids": [1],
                        }
                    ],
                }
            ],
        }


def get_llm_provider(settings: Settings) -> LLMProvider:
    if settings.default_llm_provider == "disabled":
        return DeterministicLLMProvider()
    if settings.default_llm_provider == "openai":
        return OpenAILLMProvider(settings)
    raise MissingLLMProviderKey("Selected LLM provider is not configured for Step 06")
