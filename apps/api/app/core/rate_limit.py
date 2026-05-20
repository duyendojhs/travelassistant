from collections.abc import MutableMapping
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Protocol

from fastapi import HTTPException, status


class RateLimitStore(Protocol):
    def increment(self, key: str, window_seconds: int) -> int:
        """Increment key and return the count for the current window."""


@dataclass
class RateLimitBucket:
    count: int
    expires_at: datetime


class InMemoryRateLimitStore:
    def __init__(self) -> None:
        self._buckets: MutableMapping[str, RateLimitBucket] = {}

    def increment(self, key: str, window_seconds: int) -> int:
        now = datetime.now(timezone.utc)
        bucket = self._buckets.get(key)
        if bucket is None or bucket.expires_at <= now:
            bucket = RateLimitBucket(count=0, expires_at=now + timedelta(seconds=window_seconds))
            self._buckets[key] = bucket
        bucket.count += 1
        return bucket.count

    def clear(self) -> None:
        self._buckets.clear()


class RateLimiter:
    def __init__(self, store: RateLimitStore, max_attempts: int, window_seconds: int) -> None:
        self.store = store
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds

    def check(self, key: str) -> None:
        if self.store.increment(key, self.window_seconds) > self.max_attempts:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many attempts. Please try again later.",
            )


default_rate_limit_store = InMemoryRateLimitStore()
