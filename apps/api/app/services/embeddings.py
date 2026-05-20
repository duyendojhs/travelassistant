from typing import Protocol

from openai import OpenAI

from app.core.settings import Settings


class EmbeddingProvider(Protocol):
    model: str
    dimensions: int

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        """Return one embedding vector per text."""


class MissingEmbeddingProviderKey(RuntimeError):
    pass


class OpenAIEmbeddingProvider:
    def __init__(self, settings: Settings) -> None:
        if not settings.openai_api_key:
            raise MissingEmbeddingProviderKey("OPENAI_API_KEY is required for live embeddings")
        self.model = settings.embedding_model
        self.dimensions = settings.embedding_dimensions
        self._client = OpenAI(api_key=settings.openai_api_key)

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []

        response = self._client.embeddings.create(
            model=self.model,
            input=texts,
            encoding_format="float",
            dimensions=self.dimensions,
        )
        return [item.embedding for item in sorted(response.data, key=lambda item: item.index)]


class DeterministicEmbeddingProvider:
    def __init__(self, model: str = "test-embedding", dimensions: int = 8) -> None:
        self.model = model
        self.dimensions = dimensions

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        vectors: list[list[float]] = []
        for text in texts:
            seed = sum(ord(char) for char in text)
            vector = [((seed + index * 31) % 997) / 997 for index in range(self.dimensions)]
            vectors.append(vector)
        return vectors


def get_embedding_provider(settings: Settings) -> EmbeddingProvider:
    if settings.default_llm_provider == "disabled":
        return DeterministicEmbeddingProvider(dimensions=settings.embedding_dimensions)
    return OpenAIEmbeddingProvider(settings)
