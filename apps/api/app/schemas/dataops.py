from pydantic import BaseModel, Field


class EmbeddingJobRequest(BaseModel):
    run_inline: bool = True


class EmbeddingJobResponse(BaseModel):
    job_id: str
    status: str
    provider: str
    embedding_model: str
    vector_collection: str
    total_chunks: int
    indexed_chunks: int
    queue_job_id: str | None = None
    error_message: str | None = None


class DataQualityResponse(BaseModel):
    published_articles: int
    rag_sources: int
    rag_chunks: int
    embedded_chunks: int
    chunks_missing_vectors: int
    embedding_jobs_total: int
    latest_job_status: str | None = None


class RetrievalPreviewRequest(BaseModel):
    query: str = Field(min_length=2, max_length=500)
    limit: int = Field(default=5, ge=1, le=10)


class RetrievalChunkResponse(BaseModel):
    chunk_id: str
    content: str
    score: float
    source: dict[str, object]
