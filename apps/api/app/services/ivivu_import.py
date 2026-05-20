from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import NAMESPACE_URL, uuid5

from sqlalchemy import delete, insert, select
from sqlalchemy.orm import Session

from app.models.rag import RagChunk, RagSource
from app.services.chunking import chunk_text, clean_text

IMAGE_TAG_RE = re.compile(r"\[img\]\s*(.*?)\s*\[img\]", flags=re.IGNORECASE | re.DOTALL)
SLUG_CLEAN_RE = re.compile(r"[^a-z0-9]+")


@dataclass(frozen=True)
class IvivuImportResult:
    articles_seen: int
    sources_imported: int
    chunks_imported: int
    skipped_articles: int


def _stable_uuid(*parts: object) -> str:
    seed = "|".join(str(part or "") for part in parts)
    return str(uuid5(NAMESPACE_URL, seed))


def _slugify(value: str, fallback_seed: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii").lower()
    slug = SLUG_CLEAN_RE.sub("-", ascii_text).strip("-")
    if not slug:
        slug = hashlib.sha1(fallback_seed.encode("utf-8", errors="ignore")).hexdigest()[:12]
    return slug[:220]


def _clean_optional_string(value: object) -> str:
    return str(value or "").strip()


def _extract_images(text: str) -> tuple[list[str], str]:
    images = [match.group(1).strip() for match in IMAGE_TAG_RE.finditer(text) if match.group(1).strip()]
    return images, clean_text(IMAGE_TAG_RE.sub(" ", text))


def _evaluate_stats(keypoint: dict[str, Any]) -> tuple[float, int]:
    evaluate = keypoint.get("evaluate") or {}
    try:
        mean = float(evaluate.get("mean") or 0.0)
    except (TypeError, ValueError):
        mean = 0.0
    items = evaluate.get("items")
    return mean, len(items) if isinstance(items, list) else 0


def _source_row(source_id: str, article: dict[str, Any], keypoint_count: int, now: datetime) -> dict[str, object]:
    title = _clean_optional_string(article.get("title")) or "iVIVU travel guide"
    url = _clean_optional_string(article.get("url") or article.get("URL"))
    destination = _clean_optional_string(article.get("destination"))
    published_time = _clean_optional_string(article.get("time"))
    source_name = _clean_optional_string(article.get("source")) or "ivivu_blog"

    return {
        "id": source_id,
        "source_type": "ivivu_article",
        "source_id": source_id,
        "slug": _slugify(title, source_id),
        "title": title,
        "summary": None,
        "canonical_url": url or None,
        "status": "published",
        "metadata_json": {
            "source_dataset": "ivivu_processed_jsonl",
            "source_name": source_name,
            "source_url": url,
            "destination": destination,
            "published_time": published_time,
            "keypoint_count": keypoint_count,
        },
        "created_at": now,
        "updated_at": now,
    }


def _build_chunk_rows(
    source_id: str,
    article: dict[str, Any],
    keypoint: dict[str, Any],
    fallback_index: int,
) -> list[dict[str, object]]:
    idx_info = keypoint.get("idx") or {}
    keypoint_index = idx_info.get("idx") or fallback_index
    keypoint_title = _clean_optional_string(idx_info.get("title"))
    raw_context = _clean_optional_string(idx_info.get("context"))
    images, context = _extract_images(raw_context)
    if not context:
        return []

    article_title = _clean_optional_string(article.get("title")) or "iVIVU travel guide"
    destination = _clean_optional_string(article.get("destination"))
    url = _clean_optional_string(article.get("url") or article.get("URL"))
    published_time = _clean_optional_string(article.get("time"))
    source_name = _clean_optional_string(article.get("source")) or "ivivu_blog"
    evaluate_mean, evaluate_count = _evaluate_stats(keypoint)
    heading_path = ["iVIVU", article_title]
    if destination:
        heading_path.insert(1, destination)
    if keypoint_title:
        heading_path.append(keypoint_title)

    content_parts = [article_title, keypoint_title, destination, context]
    content = clean_text("\n".join(part for part in content_parts if part))
    keypoint_chunks = chunk_text(content, max_chars=1600, overlap_chars=180)
    chunk_index_base = int(keypoint_index) * 1000 if str(keypoint_index).isdigit() else fallback_index * 1000

    records: list[dict[str, object]] = []
    now = datetime.now(timezone.utc)
    for part_index, part_content in enumerate(keypoint_chunks):
        point_id = _stable_uuid(
            "ivivu_chunk",
            url,
            article_title,
            fallback_index,
            keypoint_index,
            keypoint_title,
            part_index,
        )
        records.append(
            {
                "id": _stable_uuid("rag_chunk_row", point_id),
                "source_id": source_id,
                "point_id": point_id,
                "chunk_index": chunk_index_base + part_index,
                "chunk_type": "keypoint",
                "heading_path": heading_path,
                "content": part_content,
                "token_estimate": max(1, len(part_content) // 4),
                "char_start": None,
                "char_end": None,
                "embedding_model": None,
                "vector_collection": None,
                "embedded_at": None,
                "metadata_json": {
                    "source_dataset": "ivivu_processed_jsonl",
                    "source_name": source_name,
                    "source_url": url,
                    "destination": destination,
                    "published_time": published_time,
                    "keypoint_title": keypoint_title,
                    "keypoint_idx": keypoint_index,
                    "keypoint_part": part_index + 1,
                    "keypoint_parts": len(keypoint_chunks),
                    "evaluate_mean": evaluate_mean,
                    "evaluate_count": evaluate_count,
                    "images": images,
                },
                "created_at": now,
            }
        )
    return records


def import_ivivu_jsonl(db: Session, input_path: Path, limit: int | None = None) -> IvivuImportResult:
    articles_seen = 0
    sources_imported = 0
    chunks_imported = 0
    skipped_articles = 0
    seen_source_ids: set[str] = set()
    seen_point_ids: set[str] = set()
    source_rows: list[dict[str, object]] = []
    chunk_rows: list[dict[str, object]] = []

    source_ids = select(RagSource.id).where(RagSource.source_type == "ivivu_article")
    db.execute(delete(RagChunk).where(RagChunk.source_id.in_(source_ids)))
    db.execute(delete(RagSource).where(RagSource.source_type == "ivivu_article"))

    def flush_batch() -> None:
        nonlocal source_rows, chunk_rows
        if source_rows:
            db.execute(insert(RagSource), source_rows)
            source_rows = []
        if chunk_rows:
            db.execute(insert(RagChunk), chunk_rows)
            chunk_rows = []
        db.flush()

    with input_path.open("r", encoding="utf-8") as file:
        for line in file:
            if limit is not None and articles_seen >= limit:
                break
            line = line.strip()
            if not line:
                continue
            articles_seen += 1
            try:
                article = json.loads(line)
            except json.JSONDecodeError:
                skipped_articles += 1
                continue

            keypoints = article.get("keypoint") or []
            if not isinstance(keypoints, list) or not keypoints:
                skipped_articles += 1
                continue

            title = _clean_optional_string(article.get("title"))
            url = _clean_optional_string(article.get("url") or article.get("URL"))
            source_id = _stable_uuid("ivivu_article", url, title)
            if source_id in seen_source_ids:
                skipped_articles += 1
                continue
            seen_source_ids.add(source_id)

            source_chunk_count = 0
            article_chunk_rows: list[dict[str, object]] = []
            for index, keypoint in enumerate(keypoints):
                if not isinstance(keypoint, dict):
                    continue
                chunks = _build_chunk_rows(source_id, article, keypoint, fallback_index=index)
                added_for_keypoint = 0
                for chunk in chunks:
                    point_id = str(chunk["point_id"])
                    if point_id in seen_point_ids:
                        continue
                    seen_point_ids.add(point_id)
                    article_chunk_rows.append(chunk)
                    added_for_keypoint += 1
                source_chunk_count += added_for_keypoint

            if source_chunk_count == 0:
                skipped_articles += 1
                continue

            now = datetime.now(timezone.utc)
            source_rows.append(_source_row(source_id, article, len(keypoints), now))
            chunk_rows.extend(article_chunk_rows)
            sources_imported += 1
            chunks_imported += source_chunk_count

            if len(source_rows) >= 500 or len(chunk_rows) >= 5000:
                flush_batch()

    flush_batch()
    return IvivuImportResult(
        articles_seen=articles_seen,
        sources_imported=sources_imported,
        chunks_imported=chunks_imported,
        skipped_articles=skipped_articles,
    )
