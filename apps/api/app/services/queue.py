from redis import Redis
from rq import Queue

from app.core.settings import Settings


class EmbeddingQueue:
    def __init__(self, settings: Settings) -> None:
        self._redis = Redis.from_url(settings.redis_url)
        self._queue = Queue("ingestion", connection=self._redis)

    def enqueue_embedding_job(self, job_id: str) -> str:
        job = self._queue.enqueue("app.workers.embedding.run_embedding_job_by_id", job_id)
        return str(job.id)
