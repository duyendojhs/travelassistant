from pydantic import BaseModel, ConfigDict, Field


class ProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    display_name: str | None = None
    phone: str | None = None
    avatar_url: str | None = None


class ProfileUpdate(BaseModel):
    display_name: str | None = Field(default=None, max_length=160)
    phone: str | None = Field(default=None, max_length=40)
    avatar_url: str | None = Field(default=None, max_length=1024)


class PreferencesResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    home_city: str | None = None
    language: str = "vi"
    budget: str | None = None
    travel_style: str | None = None
    interests: list[str] = Field(default_factory=list)
    constraints: list[str] = Field(default_factory=list)
    wishlist: list[str] = Field(default_factory=list)
    saved_itinerary_refs: list[str] = Field(default_factory=list)


class PreferencesUpdate(BaseModel):
    home_city: str | None = Field(default=None, max_length=160)
    language: str = Field(default="vi", min_length=2, max_length=16)
    budget: str | None = Field(default=None, max_length=64)
    travel_style: str | None = Field(default=None, max_length=80)
    interests: list[str] = Field(default_factory=list, max_length=30)
    constraints: list[str] = Field(default_factory=list, max_length=30)
    wishlist: list[str] = Field(default_factory=list, max_length=100)
    saved_itinerary_refs: list[str] = Field(default_factory=list, max_length=100)
