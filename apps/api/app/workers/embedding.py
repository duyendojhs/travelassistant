from sqlalchemy import select

from app.core.settings import get_settings
from app.db.session import SessionLocal
from app.models.rag import EmbeddingJob
from app.services.embeddings import get_embedding_provider
from app.services.ingestion import run_embedding_job
from app.services.vector_store import QdrantVectorStore


def run_embedding_job_by_id(job_id: str) -> dict[str, object]:
    settings = get_settings()
    with SessionLocal() as db:
        job = db.scalar(select(EmbeddingJob).where(EmbeddingJob.id == job_id))
        if job is None:
            raise ValueError(f"Embedding job not found: {job_id}")
        result = run_embedding_job(
            db=db,
            job=job,
            embedding_provider=get_embedding_provider(settings),
            vector_store=QdrantVectorStore(settings),
        )
        return {
            "job_id": result.job_id,
            "status": result.status,
            "indexed_chunks": result.indexed_chunks,
        }
