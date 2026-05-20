from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.rbac import Role, require_role, role_allows
from app.core.settings import Settings, get_settings
from app.db.session import get_db
from app.models.auth import User
from app.models.content import Article, Destination, ImageVariant, MediaImage, Place
from app.schemas.content import (
    ArticleCreate,
    ArticleResponse,
    ArticleUpdate,
    ContentStatus,
    DestinationCreate,
    DestinationResponse,
    DestinationUpdate,
    ImageResponse,
    ImageAnalyzeRequest,
    ImageAnalyzeResponse,
    ImageVariantResponse,
    PlaceCreate,
    PlaceResponse,
    PlaceUpdate,
    SearchResult,
)
from app.services.audit import add_audit_log
from app.services.storage import LocalImageStorage
from app.services.vision import MissingVisionProviderKey, get_vision_provider

router = APIRouter()
admin_router = APIRouter(prefix="/admin", tags=["admin-content"])
image_router = APIRouter(prefix="/images", tags=["images"])


def require_editor(current_user: User = Depends(get_current_user)) -> User:
    require_role(current_user.role, Role.editor)
    return current_user


def _published_filter(model: type[Destination] | type[Place] | type[Article]):
    return model.status == ContentStatus.published.value


def _get_destination_by_slug(db: Session, slug: str, public_only: bool = True) -> Destination:
    statement = select(Destination).where(Destination.slug == slug)
    if public_only:
        statement = statement.where(_published_filter(Destination))
    destination = db.scalar(statement)
    if destination is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Destination not found")
    return destination


def _apply_updates(model: object, payload: object) -> None:
    updates = payload.model_dump(exclude_unset=True)  # type: ignore[attr-defined]
    for key, value in updates.items():
        if isinstance(value, ContentStatus):
            value = value.value
        setattr(model, key, value)


@router.get("/destinations", response_model=list[DestinationResponse])
def list_destinations(db: Session = Depends(get_db)) -> list[DestinationResponse]:
    destinations = db.scalars(
        select(Destination).where(_published_filter(Destination)).order_by(Destination.name)
    ).all()
    return [DestinationResponse.model_validate(destination) for destination in destinations]


@router.get("/destinations/{slug}", response_model=DestinationResponse)
def get_destination(slug: str, db: Session = Depends(get_db)) -> DestinationResponse:
    return DestinationResponse.model_validate(_get_destination_by_slug(db, slug))


@router.get("/destinations/{slug}/places", response_model=list[PlaceResponse])
def list_destination_places(slug: str, db: Session = Depends(get_db)) -> list[PlaceResponse]:
    destination = _get_destination_by_slug(db, slug)
    places = db.scalars(
        select(Place)
        .where(
            Place.destination_id == destination.id,
            _published_filter(Place),
            Place.kind.not_in(["food", "restaurant", "hotel", "stay"]),
        )
        .order_by(Place.name)
    ).all()
    return [PlaceResponse.model_validate(place) for place in places]


@router.get("/destinations/{slug}/foods", response_model=list[PlaceResponse])
def list_destination_foods(slug: str, db: Session = Depends(get_db)) -> list[PlaceResponse]:
    destination = _get_destination_by_slug(db, slug)
    foods = db.scalars(
        select(Place)
        .where(
            Place.destination_id == destination.id,
            _published_filter(Place),
            Place.kind.in_(["food", "restaurant"]),
        )
        .order_by(Place.name)
    ).all()
    return [PlaceResponse.model_validate(food) for food in foods]


@router.get("/destinations/{slug}/hotels", response_model=list[PlaceResponse])
def list_destination_hotels(slug: str, db: Session = Depends(get_db)) -> list[PlaceResponse]:
    destination = _get_destination_by_slug(db, slug)
    hotels = db.scalars(
        select(Place)
        .where(
            Place.destination_id == destination.id,
            _published_filter(Place),
            Place.kind.in_(["hotel", "stay"]),
        )
        .order_by(Place.name)
    ).all()
    return [PlaceResponse.model_validate(hotel) for hotel in hotels]


@router.get("/places/{place_id}", response_model=PlaceResponse)
def get_place(place_id: str, db: Session = Depends(get_db)) -> PlaceResponse:
    place = db.scalar(select(Place).where(Place.id == place_id, _published_filter(Place)))
    if place is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Place not found")
    return PlaceResponse.model_validate(place)


@router.get("/articles", response_model=list[ArticleResponse])
def list_articles(db: Session = Depends(get_db)) -> list[ArticleResponse]:
    articles = db.scalars(select(Article).where(_published_filter(Article)).order_by(Article.title)).all()
    return [ArticleResponse.model_validate(article) for article in articles]


@router.get("/articles/{slug}", response_model=ArticleResponse)
def get_article(slug: str, db: Session = Depends(get_db)) -> ArticleResponse:
    article = db.scalar(select(Article).where(Article.slug == slug, _published_filter(Article)))
    if article is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Article not found")
    return ArticleResponse.model_validate(article)


@router.get("/search", response_model=list[SearchResult])
def search(q: str, db: Session = Depends(get_db)) -> list[SearchResult]:
    query = f"%{q.strip()}%"
    if len(q.strip()) < 2:
        return []

    destinations = db.scalars(
        select(Destination)
        .where(_published_filter(Destination), or_(Destination.name.ilike(query), Destination.summary.ilike(query)))
        .limit(10)
    ).all()
    places = db.scalars(
        select(Place)
        .where(_published_filter(Place), or_(Place.name.ilike(query), Place.summary.ilike(query)))
        .limit(10)
    ).all()
    articles = db.scalars(
        select(Article)
        .where(_published_filter(Article), or_(Article.title.ilike(query), Article.excerpt.ilike(query)))
        .limit(10)
    ).all()

    results: list[SearchResult] = []
    results.extend(
        SearchResult(type="destination", slug=item.slug, title=item.name, summary=item.summary)
        for item in destinations
    )
    results.extend(SearchResult(type="place", slug=item.slug, title=item.name, summary=item.summary) for item in places)
    results.extend(
        SearchResult(type="article", slug=item.slug, title=item.title, summary=item.excerpt) for item in articles
    )
    return results[:20]


@admin_router.post("/destinations", response_model=DestinationResponse, status_code=status.HTTP_201_CREATED)
def create_destination(
    payload: DestinationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_editor),
) -> DestinationResponse:
    destination = Destination(**payload.model_dump(mode="json"))
    db.add(destination)
    db.flush()
    add_audit_log(db, current_user, "cms.destination.create", "destination", destination.id)
    db.commit()
    db.refresh(destination)
    return DestinationResponse.model_validate(destination)


@admin_router.put("/destinations/{destination_id}", response_model=DestinationResponse)
def update_destination(
    destination_id: str,
    payload: DestinationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_editor),
) -> DestinationResponse:
    destination = db.get(Destination, destination_id)
    if destination is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Destination not found")
    _apply_updates(destination, payload)
    add_audit_log(db, current_user, "cms.destination.update", "destination", destination.id)
    db.commit()
    db.refresh(destination)
    return DestinationResponse.model_validate(destination)


@admin_router.post("/destinations/{destination_id}/publish", response_model=DestinationResponse)
def publish_destination(
    destination_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_editor),
) -> DestinationResponse:
    destination = db.get(Destination, destination_id)
    if destination is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Destination not found")
    destination.status = ContentStatus.published.value
    add_audit_log(db, current_user, "cms.destination.publish", "destination", destination.id)
    db.commit()
    db.refresh(destination)
    return DestinationResponse.model_validate(destination)


@admin_router.delete("/destinations/{destination_id}")
def delete_destination(
    destination_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_editor),
) -> dict[str, bool]:
    destination = db.get(Destination, destination_id)
    if destination is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Destination not found")
    db.delete(destination)
    add_audit_log(db, current_user, "cms.destination.delete", "destination", destination_id)
    db.commit()
    return {"ok": True}


@admin_router.post("/places", response_model=PlaceResponse, status_code=status.HTTP_201_CREATED)
def create_place(
    payload: PlaceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_editor),
) -> PlaceResponse:
    place = Place(**payload.model_dump(mode="json"))
    db.add(place)
    db.flush()
    add_audit_log(db, current_user, "cms.place.create", "place", place.id)
    db.commit()
    db.refresh(place)
    return PlaceResponse.model_validate(place)


@admin_router.put("/places/{place_id}", response_model=PlaceResponse)
def update_place(
    place_id: str,
    payload: PlaceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_editor),
) -> PlaceResponse:
    place = db.get(Place, place_id)
    if place is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Place not found")
    _apply_updates(place, payload)
    add_audit_log(db, current_user, "cms.place.update", "place", place.id)
    db.commit()
    db.refresh(place)
    return PlaceResponse.model_validate(place)


@admin_router.post("/articles", response_model=ArticleResponse, status_code=status.HTTP_201_CREATED)
def create_article(
    payload: ArticleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_editor),
) -> ArticleResponse:
    article = Article(**payload.model_dump(mode="json"))
    db.add(article)
    db.flush()
    add_audit_log(db, current_user, "cms.article.create", "article", article.id)
    db.commit()
    db.refresh(article)
    return ArticleResponse.model_validate(article)


@admin_router.put("/articles/{article_id}", response_model=ArticleResponse)
def update_article(
    article_id: str,
    payload: ArticleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_editor),
) -> ArticleResponse:
    article = db.get(Article, article_id)
    if article is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Article not found")
    _apply_updates(article, payload)
    add_audit_log(db, current_user, "cms.article.update", "article", article.id)
    db.commit()
    db.refresh(article)
    return ArticleResponse.model_validate(article)


@image_router.post("/upload", response_model=ImageResponse, status_code=status.HTTP_201_CREATED)
async def upload_image(
    file: Annotated[UploadFile, File()],
    alt_text: Annotated[str | None, Form()] = None,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    current_user: User = Depends(get_current_user),
) -> ImageResponse:
    stored = await LocalImageStorage(settings).save_image(file)
    image = MediaImage(
        owner_user_id=current_user.id,
        object_key=stored.object_key,
        public_url=stored.public_url,
        mime_type=stored.mime_type,
        byte_size=stored.byte_size,
        width=stored.width,
        height=stored.height,
        alt_text=alt_text,
        status=ContentStatus.draft.value,
    )
    db.add(image)
    db.flush()
    add_audit_log(db, current_user, "media.image.upload", "image", image.id)
    db.commit()
    db.refresh(image)
    return ImageResponse.model_validate(image)


@image_router.get("/{image_id}", response_model=ImageResponse)
def get_image(image_id: str, db: Session = Depends(get_db)) -> ImageResponse:
    image = db.get(MediaImage, image_id)
    if image is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")
    return ImageResponse.model_validate(image)


@image_router.get("/{image_id}/variants", response_model=list[ImageVariantResponse])
def get_image_variants(image_id: str, db: Session = Depends(get_db)) -> list[ImageVariantResponse]:
    variants = db.scalars(select(ImageVariant).where(ImageVariant.image_id == image_id)).all()
    return [ImageVariantResponse.model_validate(variant) for variant in variants]


@image_router.delete("/{image_id}")
def delete_image(
    image_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, bool]:
    image = db.get(MediaImage, image_id)
    if image is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")
    if image.owner_user_id != current_user.id and not role_allows(current_user.role, Role.editor):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot delete this image")
    db.delete(image)
    add_audit_log(db, current_user, "media.image.delete", "image", image_id)
    db.commit()
    return {"ok": True}


@image_router.post("/analyze", response_model=ImageAnalyzeResponse)
def analyze_image(
    payload: ImageAnalyzeRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    current_user: User = Depends(get_current_user),
) -> ImageAnalyzeResponse:
    image = db.get(MediaImage, payload.image_id)
    if image is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")
    if image.owner_user_id != current_user.id and not role_allows(current_user.role, Role.editor):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot analyze this image")

    image_path = LocalImageStorage(settings).resolve_object_key(image.object_key)
    if not image_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image object not found")

    try:
        provider = get_vision_provider(settings)
        analysis = provider.analyze_image(image_path, mime_type=image.mime_type)
    except MissingVisionProviderKey as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Image analysis failed") from exc

    return ImageAnalyzeResponse(
        image_id=image.id,
        provider=provider.provider,
        model=provider.model,
        analysis=analysis,
    )


@image_router.post("/search-similar")
def search_similar_images() -> dict[str, object]:
    return {"status": "not_configured", "results": []}
