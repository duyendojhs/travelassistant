import re

from app.models.content import Article

WHITESPACE_RE = re.compile(r"\s+")


def clean_text(text: str) -> str:
    return WHITESPACE_RE.sub(" ", text).strip()


def infer_destination_slug(article: Article) -> str | None:
    if article.destination is not None:
        return article.destination.slug
    return None


def chunk_text(text: str, max_chars: int = 900, overlap_chars: int = 120) -> list[str]:
    cleaned = clean_text(text)
    if not cleaned:
        return []
    if len(cleaned) <= max_chars:
        return [cleaned]

    chunks: list[str] = []
    start = 0
    while start < len(cleaned):
        end = min(start + max_chars, len(cleaned))
        split_at = cleaned.rfind(". ", start, end)
        if split_at > start + 200:
            end = split_at + 1
        chunk = cleaned[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(cleaned):
            break
        start = max(0, end - overlap_chars)
    return chunks
