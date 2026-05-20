from sqlalchemy import func, select
from sqlalchemy.orm import Session
from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import get_current_user
from app.core.rbac import Role, require_role
from app.core.settings import Settings, get_settings
from app.db.session import get_db
from app.models.analytics import ModelUsage, ProductEvent, QualityMetric
from app.models.auth import AuditLog, User
from app.models.chat import ChatMessage
from app.models.content import Article, Destination, ItineraryTemplate, MediaImage, Place, Tag
from app.models.rag import EmbeddingJob, RagChunk, RagSource
from app.models.voice import VoiceJob
from app.schemas.admin import (
    AdminContentSummary,
    AuditLogResponse,
    DashboardMetric,
    DashboardSummary,
    ItineraryTemplateCreate,
    ItineraryTemplateResponse,
    ItineraryTemplateUpdate,
    ProductEventCreate,
    ProductEventResponse,
    RankedMetric,
    TagCreate,
    TagResponse,
    TagUpdate,
)
from app.schemas.content import (
    ArticleResponse,
    ContentStatus,
    DestinationResponse,
    ImageResponse,
    PlaceResponse,
)
from app.services.audit import add_audit_log
from app.services.ingestion import create_embedding_job

router = APIRouter(prefix="/admin", tags=["admin"])
events_router = APIRouter(prefix="/events", tags=["events"])


def require_editor(current_user: User = Depends(get_current_user)) -> User:
    require_role(current_user.role, Role.editor)
    return current_user


def _apply_updates(model: object, payload: object) -> None:
    updates = payload.model_dump(exclude_unset=True)  # type: ignore[attr-defined]
    for key, value in updates.items():
        if isinstance(value, ContentStatus):
            value = value.value
        setattr(model, key, value)


def _ranked(rows: list[tuple[str | None, int]]) -> list[RankedMetric]:
    return [RankedMetric(key=key or "unknown", count=count) for key, count in rows]


def _count_by_status(db: Session, model: type[Destination] | type[Place] | type[Article] | type[MediaImage] | type[ItineraryTemplate]) -> list[RankedMetric]:
    rows = db.execute(select(model.status, func.count()).group_by(model.status).order_by(model.status)).all()
    return _ranked([(str(status_value), int(count)) for status_value, count in rows])


def _content_model(target_type: str) -> type[Destination] | type[Place] | type[Article] | type[ItineraryTemplate] | type[MediaImage]:
    models: dict[str, type[Destination] | type[Place] | type[Article] | type[ItineraryTemplate] | type[MediaImage]] = {
        "destination": Destination,
        "place": Place,
        "article": Article,
        "itinerary_template": ItineraryTemplate,
        "image": MediaImage,
    }
    model = models.get(target_type)
    if model is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unsupported content type")
    return model


def _enqueue_reindex(db: Session, current_user: User, settings: Settings, target_type: str, target_id: str) -> None:
    job = create_embedding_job(
        db=db,
        requested_by_user_id=current_user.id,
        provider=settings.default_llm_provider,
        embedding_model=settings.embedding_model,
        vector_collection=settings.qdrant_collection,
    )
    add_audit_log(
        db,
        current_user,
        "rag.reindex.queued",
        "embedding_job",
        job.id,
        {"trigger": "publish", "target_type": target_type, "target_id": target_id},
    )


@events_router.post("", response_model=ProductEventResponse, status_code=status.HTTP_201_CREATED)
def ingest_event(
    payload: ProductEventCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProductEventResponse:
    event = ProductEvent(user_id=current_user.id, **payload.model_dump(mode="json"))
    db.add(event)
    db.commit()
    db.refresh(event)
    return ProductEventResponse.model_validate(event)


@router.get("/dashboard", response_model=DashboardSummary)
def dashboard_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_editor),
) -> DashboardSummary:
    total_users = int(db.scalar(select(func.count(User.id))) or 0)
    total_events = int(db.scalar(select(func.count(ProductEvent.id))) or 0)
    total_saved_trips = int(db.scalar(select(func.count()).select_from(ItineraryTemplate)) or 0)
    total_chunks = int(db.scalar(select(func.count(RagChunk.id))) or 0)

    avg_latency = db.scalar(select(func.avg(ProductEvent.latency_ms)).where(ProductEvent.latency_ms.is_not(None)))
    total_cost = db.scalar(select(func.coalesce(func.sum(ModelUsage.cost_usd), 0.0)))
    total_tokens = db.scalar(select(func.coalesce(func.sum(ModelUsage.total_tokens), 0)))
    avg_quality = db.scalar(select(func.avg(QualityMetric.metric_value)))

    top_destinations = _ranked(
        [(row[0], int(row[1])) for row in db.execute(
            select(ProductEvent.destination_slug, func.count())
            .where(ProductEvent.destination_slug.is_not(None))
            .group_by(ProductEvent.destination_slug)
            .order_by(func.count().desc())
            .limit(8)
        ).all()]
    )
    top_intents = _ranked(
        [(row[0], int(row[1])) for row in db.execute(
            select(ProductEvent.intent, func.count())
            .where(ProductEvent.intent.is_not(None))
            .group_by(ProductEvent.intent)
            .order_by(func.count().desc())
            .limit(8)
        ).all()]
    )
    feedback = _ranked(
        [(row[0], int(row[1])) for row in db.execute(
            select(ChatMessage.feedback_state, func.count())
            .where(ChatMessage.feedback_state.is_not(None))
            .group_by(ChatMessage.feedback_state)
            .order_by(func.count().desc())
        ).all()]
    )
    embedding_status = _ranked(
        [(row[0], int(row[1])) for row in db.execute(
            select(EmbeddingJob.status, func.count()).group_by(EmbeddingJob.status).order_by(EmbeddingJob.status)
        ).all()]
    )
    voice_status = _ranked(
        [(f"voice:{row[0]}", int(row[1])) for row in db.execute(
            select(VoiceJob.status, func.count()).group_by(VoiceJob.status).order_by(VoiceJob.status)
        ).all()]
    )

    return DashboardSummary(
        metrics=[
            DashboardMetric(label="users", value=total_users),
            DashboardMetric(label="events", value=total_events),
            DashboardMetric(label="saved_trip_templates", value=total_saved_trips),
        ],
        top_destinations=top_destinations,
        top_intents=top_intents,
        rag_quality=[
            DashboardMetric(label="rag_sources", value=int(db.scalar(select(func.count(RagSource.id))) or 0)),
            DashboardMetric(label="rag_chunks", value=total_chunks),
            DashboardMetric(label="avg_quality", value=round(float(avg_quality or 0), 3)),
        ],
        data_quality=[
            DashboardMetric(label="draft_destinations", value=int(db.scalar(select(func.count(Destination.id)).where(Destination.status == "draft")) or 0)),
            DashboardMetric(label="draft_articles", value=int(db.scalar(select(func.count(Article.id)).where(Article.status == "draft")) or 0)),
            DashboardMetric(label="unembedded_chunks", value=int(db.scalar(select(func.count(RagChunk.id)).where(RagChunk.embedded_at.is_(None))) or 0)),
        ],
        cost_latency=[
            DashboardMetric(label="avg_latency_ms", value=round(float(avg_latency or 0), 2), unit="ms"),
            DashboardMetric(label="model_cost_usd", value=round(float(total_cost or 0), 6), unit="usd"),
            DashboardMetric(label="model_tokens", value=int(total_tokens or 0), unit="tokens"),
        ],
        feedback=feedback,
        job_status=embedding_status + voice_status,
    )


@router.get("/content/summary", response_model=AdminContentSummary)
def content_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_editor),
) -> AdminContentSummary:
    return AdminContentSummary(
        destinations_by_status=_count_by_status(db, Destination),
        places_by_status=_count_by_status(db, Place),
        articles_by_status=_count_by_status(db, Article),
        images_by_status=_count_by_status(db, MediaImage),
        itinerary_templates_by_status=_count_by_status(db, ItineraryTemplate),
        tag_count=int(db.scalar(select(func.count(Tag.id))) or 0),
    )


@router.get("/audit-logs", response_model=list[AuditLogResponse])
def list_audit_logs(
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_editor),
) -> list[AuditLogResponse]:
    safe_limit = min(max(limit, 1), 200)
    logs = db.scalars(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(safe_limit)).all()
    return [AuditLogResponse.model_validate(log) for log in logs]


@router.get("/destinations", response_model=list[DestinationResponse])
def admin_list_destinations(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_editor),
) -> list[DestinationResponse]:
    return [DestinationResponse.model_validate(item) for item in db.scalars(select(Destination).order_by(Destination.name)).all()]


@router.get("/places", response_model=list[PlaceResponse])
def admin_list_places(
    kind: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_editor),
) -> list[PlaceResponse]:
    statement = select(Place).order_by(Place.name)
    if kind:
        statement = statement.where(Place.kind == kind)
    return [PlaceResponse.model_validate(item) for item in db.scalars(statement).all()]


@router.delete("/places/{place_id}")
def admin_delete_place(
    place_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_editor),
) -> dict[str, bool]:
    place = db.get(Place, place_id)
    if place is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Place not found")
    db.delete(place)
    add_audit_log(db, current_user, "cms.place.delete", "place", place_id)
    db.commit()
    return {"ok": True}


@router.get("/articles", response_model=list[ArticleResponse])
def admin_list_articles(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_editor),
) -> list[ArticleResponse]:
    return [ArticleResponse.model_validate(item) for item in db.scalars(select(Article).order_by(Article.title)).all()]


@router.delete("/articles/{article_id}")
def admin_delete_article(
    article_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_editor),
) -> dict[str, bool]:
    article = db.get(Article, article_id)
    if article is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Article not found")
    db.delete(article)
    add_audit_log(db, current_user, "cms.article.delete", "article", article_id)
    db.commit()
    return {"ok": True}


@router.get("/images", response_model=list[ImageResponse])
def admin_list_images(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_editor),
) -> list[ImageResponse]:
    images = db.scalars(select(MediaImage).order_by(MediaImage.created_at.desc())).all()
    return [ImageResponse.model_validate(image) for image in images]


@router.get("/tags", response_model=list[TagResponse])
def list_tags(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_editor),
) -> list[TagResponse]:
    tags = db.scalars(select(Tag).order_by(Tag.name)).all()
    return [TagResponse.model_validate(tag) for tag in tags]


@router.post("/tags", response_model=TagResponse, status_code=status.HTTP_201_CREATED)
def create_tag(
    payload: TagCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_editor),
) -> TagResponse:
    tag = Tag(**payload.model_dump(mode="json"))
    db.add(tag)
    db.flush()
    add_audit_log(db, current_user, "cms.tag.create", "tag", tag.id)
    db.commit()
    db.refresh(tag)
    return TagResponse.model_validate(tag)


@router.put("/tags/{tag_id}", response_model=TagResponse)
def update_tag(
    tag_id: str,
    payload: TagUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_editor),
) -> TagResponse:
    tag = db.get(Tag, tag_id)
    if tag is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tag not found")
    _apply_updates(tag, payload)
    add_audit_log(db, current_user, "cms.tag.update", "tag", tag.id)
    db.commit()
    db.refresh(tag)
    return TagResponse.model_validate(tag)


@router.delete("/tags/{tag_id}")
def delete_tag(
    tag_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_editor),
) -> dict[str, bool]:
    tag = db.get(Tag, tag_id)
    if tag is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tag not found")
    db.delete(tag)
    add_audit_log(db, current_user, "cms.tag.delete", "tag", tag_id)
    db.commit()
    return {"ok": True}


@router.get("/itinerary-templates", response_model=list[ItineraryTemplateResponse])
def list_itinerary_templates(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_editor),
) -> list[ItineraryTemplateResponse]:
    templates = db.scalars(select(ItineraryTemplate).order_by(ItineraryTemplate.title)).all()
    return [ItineraryTemplateResponse.model_validate(template) for template in templates]


@router.post("/itinerary-templates", response_model=ItineraryTemplateResponse, status_code=status.HTTP_201_CREATED)
def create_itinerary_template(
    payload: ItineraryTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_editor),
) -> ItineraryTemplateResponse:
    template = ItineraryTemplate(**payload.model_dump(mode="json"))
    db.add(template)
    db.flush()
    add_audit_log(db, current_user, "cms.itinerary_template.create", "itinerary_template", template.id)
    db.commit()
    db.refresh(template)
    return ItineraryTemplateResponse.model_validate(template)


@router.put("/itinerary-templates/{template_id}", response_model=ItineraryTemplateResponse)
def update_itinerary_template(
    template_id: str,
    payload: ItineraryTemplateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_editor),
) -> ItineraryTemplateResponse:
    template = db.get(ItineraryTemplate, template_id)
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Itinerary template not found")
    _apply_updates(template, payload)
    add_audit_log(db, current_user, "cms.itinerary_template.update", "itinerary_template", template.id)
    db.commit()
    db.refresh(template)
    return ItineraryTemplateResponse.model_validate(template)


@router.delete("/itinerary-templates/{template_id}")
def delete_itinerary_template(
    template_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_editor),
) -> dict[str, bool]:
    template = db.get(ItineraryTemplate, template_id)
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Itinerary template not found")
    db.delete(template)
    add_audit_log(db, current_user, "cms.itinerary_template.delete", "itinerary_template", template_id)
    db.commit()
    return {"ok": True}


@router.post("/{target_type}/{target_id}/publish")
def publish_content(
    target_type: str,
    target_id: str,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    current_user: User = Depends(require_editor),
) -> dict[str, str]:
    model = _content_model(target_type)
    item = db.get(model, target_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Content item not found")
    setattr(item, "status", ContentStatus.published.value)
    add_audit_log(db, current_user, f"cms.{target_type}.publish", target_type, target_id)
    if target_type != "image":
        _enqueue_reindex(db, current_user, settings, target_type, target_id)
    db.commit()
    return {"id": target_id, "status": ContentStatus.published.value}
