from sqlalchemy.orm import Session

from app.models.analytics import ModelUsage, ProductEvent


def estimate_tokens(*parts: str | None) -> int:
    text = " ".join(part for part in parts if part)
    return max(1, len(text) // 4) if text else 0


def estimate_cost_usd(provider: str, total_tokens: int) -> float:
    if provider == "disabled" or total_tokens <= 0:
        return 0.0
    return round((total_tokens / 1_000_000) * 0.15, 8)


def record_model_usage(
    db: Session,
    *,
    user_id: str | None,
    model_provider: str,
    feature: str,
    prompt_text: str,
    completion_text: str,
    latency_ms: int | None,
    metadata: dict[str, object] | None = None,
) -> ModelUsage:
    provider, _, model = model_provider.partition(":")
    prompt_tokens = estimate_tokens(prompt_text)
    completion_tokens = estimate_tokens(completion_text)
    total_tokens = prompt_tokens + completion_tokens
    usage = ModelUsage(
        user_id=user_id,
        provider=provider or "unknown",
        model=model or "unknown",
        feature=feature,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        total_tokens=total_tokens,
        latency_ms=latency_ms,
        cost_usd=estimate_cost_usd(provider, total_tokens),
        metadata_json=metadata or {},
    )
    db.add(usage)
    return usage


def record_product_event(
    db: Session,
    *,
    user_id: str | None,
    event_name: str,
    intent: str | None = None,
    destination_slug: str | None = None,
    latency_ms: int | None = None,
    cost_usd: float | None = None,
    metadata: dict[str, object] | None = None,
) -> ProductEvent:
    event = ProductEvent(
        user_id=user_id,
        event_name=event_name,
        intent=intent,
        destination_slug=destination_slug,
        latency_ms=latency_ms,
        cost_usd=cost_usd,
        metadata_json=metadata or {},
    )
    db.add(event)
    return event
