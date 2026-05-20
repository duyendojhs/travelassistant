from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict

from app.core.settings import get_settings

router = APIRouter()


class HealthResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    name: str
    status: str
    version: str


@router.get("", response_model=HealthResponse)
def health() -> HealthResponse:
    settings = get_settings()
    return HealthResponse(
        name=settings.app_name,
        status="ok",
        version=settings.app_version,
    )
