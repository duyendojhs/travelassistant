from __future__ import annotations

from uuid import uuid4
from time import perf_counter

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.settings import Settings, get_settings
from app.db.session import get_db
from app.models.auth import User
from app.models.content import SavedItinerary
from app.services.analytics import record_model_usage, record_product_event
from app.schemas.itinerary import (
    ItineraryGenerateRequest,
    ItineraryUpdateRequest,
    SavedItineraryResponse,
)
from app.services.embeddings import MissingEmbeddingProviderKey, get_embedding_provider
from app.services.itinerary_generation import ItineraryGenerationService
from app.services.llm import MissingLLMProviderKey, get_llm_provider
from app.services.retrieval import RetrievalService
from app.services.vector_store import QdrantVectorStore

router = APIRouter(prefix="/itineraries", tags=["itineraries"])
shared_router = APIRouter(prefix="/shared/itineraries", tags=["shared-itineraries"])


def _generation_service(settings: Settings) -> ItineraryGenerationService:
    return ItineraryGenerationService(
        retrieval_service=RetrievalService(
            embedding_provider=get_embedding_provider(settings),
            vector_store=QdrantVectorStore(settings),
        ),
        llm_provider=get_llm_provider(settings),
    )


def _owned_itinerary(db: Session, itinerary_id: str, user: User) -> SavedItinerary:
    itinerary = db.scalar(
        select(SavedItinerary).where(SavedItinerary.id == itinerary_id, SavedItinerary.owner_user_id == user.id)
    )
    if itinerary is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Itinerary not found")
    return itinerary


@router.post("/generate", response_model=SavedItineraryResponse, status_code=status.HTTP_201_CREATED)
def generate_itinerary(
    payload: ItineraryGenerateRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    current_user: User = Depends(get_current_user),
) -> SavedItineraryResponse:
    started = perf_counter()
    try:
        result = _generation_service(settings).generate(
            db,
            destination=payload.destination,
            days=payload.days,
            interests=payload.interests,
            budget=payload.budget,
            travelers=payload.travelers,
        )
    except (MissingEmbeddingProviderKey, MissingLLMProviderKey) as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    plan = result.itinerary.model_dump(mode="json")
    itinerary = SavedItinerary(
        owner_user_id=current_user.id,
        title=result.itinerary.title,
        destination=result.itinerary.destination,
        days=len(result.itinerary.days),
        request_json=payload.model_dump(mode="json"),
        plan_json=plan,
        citations=result.citations,
        source_chunks=result.source_chunks,
    )
    db.add(itinerary)
    latency_ms = int((perf_counter() - started) * 1000)
    record_model_usage(
        db,
        user_id=current_user.id,
        model_provider=f"{get_llm_provider(settings).provider}:{get_llm_provider(settings).model}",
        feature="itinerary",
        prompt_text=str(payload.model_dump(mode="json")),
        completion_text=str(plan),
        latency_ms=latency_ms,
        metadata={"citation_count": len(result.citations), "days": len(result.itinerary.days)},
    )
    record_product_event(
        db,
        user_id=current_user.id,
        event_name="itinerary_generate",
        intent="planner",
        destination_slug=payload.destination.lower().replace(" ", "-"),
        latency_ms=latency_ms,
        metadata={"days": payload.days, "travelers": payload.travelers},
    )
    db.commit()
    db.refresh(itinerary)
    return SavedItineraryResponse.model_validate(itinerary)


@router.get("", response_model=list[SavedItineraryResponse])
def list_itineraries(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[SavedItineraryResponse]:
    itineraries = db.scalars(
        select(SavedItinerary)
        .where(SavedItinerary.owner_user_id == current_user.id)
        .order_by(SavedItinerary.updated_at.desc())
    ).all()
    return [SavedItineraryResponse.model_validate(item) for item in itineraries]


@router.get("/{itinerary_id}", response_model=SavedItineraryResponse)
def get_itinerary(
    itinerary_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SavedItineraryResponse:
    return SavedItineraryResponse.model_validate(_owned_itinerary(db, itinerary_id, current_user))


@router.put("/{itinerary_id}", response_model=SavedItineraryResponse)
def update_itinerary(
    itinerary_id: str,
    payload: ItineraryUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SavedItineraryResponse:
    itinerary = _owned_itinerary(db, itinerary_id, current_user)
    if payload.title is not None:
        itinerary.title = payload.title
    if payload.plan_json is not None:
        itinerary.plan_json = payload.plan_json
    db.commit()
    db.refresh(itinerary)
    return SavedItineraryResponse.model_validate(itinerary)


@router.delete("/{itinerary_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_itinerary(
    itinerary_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    itinerary = _owned_itinerary(db, itinerary_id, current_user)
    db.delete(itinerary)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{itinerary_id}/share", response_model=SavedItineraryResponse)
def share_itinerary(
    itinerary_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SavedItineraryResponse:
    itinerary = _owned_itinerary(db, itinerary_id, current_user)
    if not itinerary.share_id:
        itinerary.share_id = uuid4().hex[:16]
    itinerary.is_shared = True
    db.commit()
    db.refresh(itinerary)
    return SavedItineraryResponse.model_validate(itinerary)


@shared_router.get("/{share_id}", response_model=SavedItineraryResponse)
def get_shared_itinerary(share_id: str, db: Session = Depends(get_db)) -> SavedItineraryResponse:
    itinerary = db.scalar(
        select(SavedItinerary).where(SavedItinerary.share_id == share_id, SavedItinerary.is_shared.is_(True))
    )
    if itinerary is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shared itinerary not found")
    return SavedItineraryResponse.model_validate(itinerary)
