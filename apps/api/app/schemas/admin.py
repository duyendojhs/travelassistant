from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.content import ContentStatus


class TagCreate(BaseModel):
    slug: str = Field(min_length=2, max_length=160)
    name: str = Field(min_length=2, max_length=160)


class TagUpdate(BaseModel):
    slug: str | None = Field(default=None, min_length=2, max_length=160)
    name: str | None = Field(default=None, min_length=2, max_length=160)


class TagResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    slug: str
    name: str
    created_at: datetime


class ItineraryTemplateCreate(BaseModel):
    destination_id: str | None = None
    slug: str = Field(min_length=2, max_length=220)
    title: str = Field(min_length=2, max_length=260)
    days: int = Field(ge=1, le=60)
    budget_level: str | None = Field(default=None, max_length=64)
    traveler_type: str | None = Field(default=None, max_length=80)
    plan_json: dict[str, object] = Field(default_factory=dict)
    status: ContentStatus = ContentStatus.draft


class ItineraryTemplateUpdate(BaseModel):
    destination_id: str | None = None
    slug: str | None = Field(default=None, min_length=2, max_length=220)
    title: str | None = Field(default=None, min_length=2, max_length=260)
    days: int | None = Field(default=None, ge=1, le=60)
    budget_level: str | None = Field(default=None, max_length=64)
    traveler_type: str | None = Field(default=None, max_length=80)
    plan_json: dict[str, object] | None = None
    status: ContentStatus | None = None


class ItineraryTemplateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    destination_id: str | None
    slug: str
    title: str
    days: int
    budget_level: str | None
    traveler_type: str | None
    plan_json: dict[str, object]
    status: ContentStatus
    created_at: datetime
    updated_at: datetime


class AuditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    actor_user_id: str | None
    action: str
    target_type: str
    target_id: str | None
    metadata_json: dict[str, object]
    created_at: datetime


class ProductEventCreate(BaseModel):
    event_name: str = Field(min_length=2, max_length=120)
    intent: str | None = Field(default=None, max_length=120)
    destination_slug: str | None = Field(default=None, max_length=220)
    session_id: str | None = Field(default=None, max_length=120)
    latency_ms: int | None = Field(default=None, ge=0)
    cost_usd: float | None = Field(default=None, ge=0)
    metadata_json: dict[str, object] = Field(default_factory=dict)


class ProductEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str | None
    event_name: str
    intent: str | None
    destination_slug: str | None
    session_id: str | None
    latency_ms: int | None
    cost_usd: float | None
    metadata_json: dict[str, object]
    created_at: datetime


class DashboardMetric(BaseModel):
    label: str
    value: int | float | str
    unit: str | None = None


class RankedMetric(BaseModel):
    key: str
    count: int


class DashboardSummary(BaseModel):
    metrics: list[DashboardMetric]
    top_destinations: list[RankedMetric]
    top_intents: list[RankedMetric]
    rag_quality: list[DashboardMetric]
    data_quality: list[DashboardMetric]
    cost_latency: list[DashboardMetric]
    feedback: list[RankedMetric]
    job_status: list[RankedMetric]


class AdminContentSummary(BaseModel):
    destinations_by_status: list[RankedMetric]
    places_by_status: list[RankedMetric]
    articles_by_status: list[RankedMetric]
    images_by_status: list[RankedMetric]
    itinerary_templates_by_status: list[RankedMetric]
    tag_count: int
