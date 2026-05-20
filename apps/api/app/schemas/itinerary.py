from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ItineraryBlock(BaseModel):
    time: str = Field(min_length=1, max_length=80)
    title: str = Field(min_length=1, max_length=160)
    description: str = Field(min_length=1)
    place_ids: list[str] = Field(default_factory=list)
    cost_estimate: str = Field(default="not_available", max_length=160)
    route_hint: str = Field(default="not_available", max_length=500)
    citation_ids: list[int] = Field(default_factory=list)


class ItineraryDay(BaseModel):
    day: int = Field(ge=1, le=30)
    theme: str = Field(min_length=1, max_length=180)
    blocks: list[ItineraryBlock] = Field(min_length=1)


class GeneratedItinerary(BaseModel):
    title: str = Field(min_length=1, max_length=260)
    destination: str = Field(min_length=1, max_length=180)
    days: list[ItineraryDay] = Field(min_length=1, max_length=30)


class ItineraryGenerateRequest(BaseModel):
    destination: str = Field(min_length=2, max_length=180)
    days: int = Field(default=3, ge=1, le=14)
    interests: list[str] = Field(default_factory=list, max_length=20)
    budget: str | None = Field(default=None, max_length=80)
    travelers: int = Field(default=1, ge=1, le=50)


class ItineraryGenerateResponse(BaseModel):
    itinerary: GeneratedItinerary
    citations: list[dict[str, object]]
    source_chunks: list[dict[str, object]]


class SavedItineraryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    owner_user_id: str
    title: str
    destination: str
    days: int
    request_json: dict[str, object]
    plan_json: dict[str, object]
    citations: list[dict[str, object]]
    source_chunks: list[dict[str, object]]
    share_id: str | None
    is_shared: bool
    created_at: datetime
    updated_at: datetime


class ItineraryUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=260)
    plan_json: dict[str, object] | None = None
