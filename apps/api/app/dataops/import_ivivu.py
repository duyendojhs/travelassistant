from __future__ import annotations

import argparse
from pathlib import Path

from app.core.settings import get_settings
from app.db.session import SessionLocal
from app.services.ivivu_import import import_ivivu_jsonl


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import iVIVU processed JSONL into generic RAG tables.")
    parser.add_argument("--input", help="Path to preprocessed_data.jsonl. Defaults to IVIVU_PROCESSED_DATA_PATH.")
    parser.add_argument("--limit", type=int, default=None, help="Optional article limit for smoke tests.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    settings = get_settings()
    input_value = args.input or settings.ivivu_processed_data_path
    if not input_value:
        raise SystemExit("Provide --input or set IVIVU_PROCESSED_DATA_PATH.")

    input_path = Path(input_value).expanduser().resolve()
    if not input_path.exists():
        raise SystemExit(f"Input file not found: {input_path}")

    with SessionLocal() as db:
        result = import_ivivu_jsonl(db, input_path=input_path, limit=args.limit)
        db.commit()

    print(
        "Imported iVIVU RAG sources: "
        f"articles_seen={result.articles_seen}, "
        f"sources_imported={result.sources_imported}, "
        f"chunks_imported={result.chunks_imported}, "
        f"skipped_articles={result.skipped_articles}"
    )


if __name__ == "__main__":
    main()
