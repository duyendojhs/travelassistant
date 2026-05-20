from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class ContentStatus(str, Enum):
    draft = "draft"
    review = "review"
    published = "published"
    archived = "archived"


class DestinationBase(BaseModel):
    slug: str = Field(min_length=2, max_length=180)
    name: str = Field(min_length=2, max_length=180)
    region: str | None = Field(default=None, max_length=120)
    summary: str = Field(min_length=8)
    description: str | None = None
    status: ContentStatus = ContentStatus.draft
    latitude: float | None = None
    longitude: float | None = None


class DestinationCreate(DestinationBase):
    pass


class DestinationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=180)
    region: str | None = Field(default=None, max_length=120)
    summary: str | None = Field(default=None, min_length=8)
    description: str | None = None
    status: ContentStatus | None = None
    latitude: float | None = None
    longitude: float | None = None


class DestinationResponse(DestinationBase):
    model_config = ConfigDict(from_attributes=True)

    id: str


class PlaceBase(BaseModel):
    destination_id: str
    slug: str = Field(min_length=2, max_length=180)
    name: str = Field(min_length=2, max_length=180)
    kind: str = Field(default="attraction", max_length=40)
    summary: str = Field(min_length=8)
    address: str | None = Field(default=None, max_length=320)
    latitude: float | None = None
    longitude: float | None = None
    price_level: str | None = Field(default=None, max_length=40)
    status: ContentStatus = ContentStatus.draft
    metadata_json: dict[str, object] = Field(default_factory=dict)


class PlaceCreate(PlaceBase):
    pass


class PlaceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=180)
    kind: str | None = Field(default=None, max_length=40)
    summary: str | None = Field(default=None, min_length=8)
    address: str | None = Field(default=None, max_length=320)
    latitude: float | None = None
    longitude: float | None = None
    price_level: str | None = Field(default=None, max_length=40)
    status: ContentStatus | None = None
    metadata_json: dict[str, object] | None = None


class PlaceResponse(PlaceBase):
    model_config = ConfigDict(from_attributes=True)

    id: str


class ArticleBase(BaseModel):
    destination_id: str | None = None
    slug: str = Field(min_length=2, max_length=220)
    title: str = Field(min_length=2, max_length=260)
    excerpt: str = Field(min_length=8)
    body: str = Field(min_length=8)
    source_url: str | None = Field(default=None, max_length=1024)
    status: ContentStatus = ContentStatus.draft


class ArticleCreate(ArticleBase):
    pass


class ArticleUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=260)
    excerpt: str | None = Field(default=None, min_length=8)
    body: str | None = Field(default=None, min_length=8)
    source_url: str | None = Field(default=None, max_length=1024)
    status: ContentStatus | None = None


class ArticleResponse(ArticleBase):
    model_config = ConfigDict(from_attributes=True)

    id: str


class ImageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    object_key: str
    public_url: str
    mime_type: str
    byte_size: int
    width: int | None = None
    height: int | None = None
    alt_text: str | None = None
    status: ContentStatus


class ImageVariantResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    image_id: str
    variant_name: str
    object_key: str
    public_url: str
    width: int | None = None
    height: int | None = None
    byte_size: int | None = None


class ImageAnalyzeRequest(BaseModel):
    image_id: str


class ImageAnalyzeResponse(BaseModel):
    image_id: str
    provider: str
    model: str
    analysis: dict[str, object]


class SearchResult(BaseModel):
    type: str
    slug: str
    title: str
    summary: str
