from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.rbac import Role, require_role
from app.core.settings import Settings, get_settings
from app.db.session import get_db
from app.models.auth import User
from app.models.content import Article
from app.models.rag import EmbeddingJob, RagChunk, RagSource
from app.schemas.dataops import (
    DataQualityResponse,
    EmbeddingJobRequest,
    EmbeddingJobResponse,
    RetrievalChunkResponse,
    RetrievalPreviewRequest,
)
from app.services.embeddings import MissingEmbeddingProviderKey, get_embedding_provider
from app.services.ingestion import create_embedding_job, run_embedding_job
from app.services.queue import EmbeddingQueue
from app.services.retrieval import RetrievalService
from app.services.vector_store import QdrantVectorStore

router = APIRouter(prefix="/dataops", tags=["dataops"])


def require_editor(current_user: User = Depends(get_current_user)) -> User:
    require_role(current_user.role, Role.editor)
    return current_user


def _job_response(job: EmbeddingJob, queue_job_id: str | None = None) -> EmbeddingJobResponse:
    return EmbeddingJobResponse(
        job_id=job.id,
        status=job.status,
        provider=job.provider,
        embedding_model=job.embedding_model,
        vector_collection=job.vector_collection,
        total_chunks=job.total_chunks,
        indexed_chunks=job.indexed_chunks,
        queue_job_id=queue_job_id,
        error_message=job.error_message,
    )


def _create_and_maybe_run_job(
    payload: EmbeddingJobRequest,
    db: Session,
    current_user: User,
    settings: Settings,
) -> EmbeddingJobResponse:
    job = create_embedding_job(
        db=db,
        requested_by_user_id=current_user.id,
        provider="openai",
        embedding_model=settings.embedding_model,
        vector_collection=settings.qdrant_collection,
    )

    if not payload.run_inline:
        queue_job_id = EmbeddingQueue(settings).enqueue_embedding_job(job.id)
        return _job_response(job, queue_job_id=queue_job_id)

    try:
        run_embedding_job(
            db=db,
            job=job,
            embedding_provider=get_embedding_provider(settings),
            vector_store=QdrantVectorStore(settings),
        )
    except MissingEmbeddingProviderKey as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    db.refresh(job)
    return _job_response(job)


@router.post("/embedding-jobs", response_model=EmbeddingJobResponse, status_code=status.HTTP_201_CREATED)
def create_embedding_job_endpoint(
    payload: EmbeddingJobRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    current_user: User = Depends(require_editor),
) -> EmbeddingJobResponse:
    return _create_and_maybe_run_job(payload, db, current_user, settings)


@router.post("/reindex", response_model=EmbeddingJobResponse, status_code=status.HTTP_201_CREATED)
def reindex(
    payload: EmbeddingJobRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    current_user: User = Depends(require_editor),
) -> EmbeddingJobResponse:
    return _create_and_maybe_run_job(payload, db, current_user, settings)


@router.get("/data-quality", response_model=DataQualityResponse)
def data_quality(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_editor),
) -> DataQualityResponse:
    published_articles = db.scalar(
        select(func.count()).select_from(Article).where(Article.status == "published")
    ) or 0
    rag_sources = db.scalar(select(func.count()).select_from(RagSource)) or 0
    rag_chunks = db.scalar(select(func.count()).select_from(RagChunk)) or 0
    embedded_chunks = db.scalar(
        select(func.count()).select_from(RagChunk).where(RagChunk.embedded_at.is_not(None))
    ) or 0
    jobs_total = db.scalar(select(func.count()).select_from(EmbeddingJob)) or 0
    latest_job = db.scalar(select(EmbeddingJob).order_by(EmbeddingJob.created_at.desc()).limit(1))
    return DataQualityResponse(
        published_articles=published_articles,
        rag_sources=rag_sources,
        rag_chunks=rag_chunks,
        embedded_chunks=embedded_chunks,
        chunks_missing_vectors=max(rag_chunks - embedded_chunks, 0),
        embedding_jobs_total=jobs_total,
        latest_job_status=latest_job.status if latest_job else None,
    )


@router.post("/retrieval-preview", response_model=list[RetrievalChunkResponse])
def retrieval_preview(
    payload: RetrievalPreviewRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    current_user: User = Depends(require_editor),
) -> list[RetrievalChunkResponse]:
    try:
        service = RetrievalService(
            embedding_provider=get_embedding_provider(settings),
            vector_store=QdrantVectorStore(settings),
        )
    except MissingEmbeddingProviderKey as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    chunks = service.retrieve(db, payload.query, limit=payload.limit)
    return [RetrievalChunkResponse(**chunk.__dict__) for chunk in chunks]
