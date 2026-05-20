from __future__ import annotations

from app.core.settings import get_settings
from app.db.session import SessionLocal
from app.services.embeddings import get_embedding_provider
from app.services.ingestion import create_embedding_job, run_embedding_job
from app.services.vector_store import QdrantVectorStore


def main() -> None:
    settings = get_settings()
    with SessionLocal() as db:
        job = create_embedding_job(
            db=db,
            requested_by_user_id=None,
            provider="openai" if settings.default_llm_provider != "disabled" else "disabled",
            embedding_model=settings.embedding_model,
            vector_collection=settings.qdrant_collection,
        )
        result = run_embedding_job(
            db=db,
            job=job,
            embedding_provider=get_embedding_provider(settings),
            vector_store=QdrantVectorStore(settings),
        )
    print(
        "RAG reindex completed: "
        f"job_id={result.job_id}, "
        f"status={result.status}, "
        f"total_chunks={result.total_chunks}, "
        f"indexed_chunks={result.indexed_chunks}, "
        f"vector_collection={result.vector_collection}"
    )


if __name__ == "__main__":
    main()
