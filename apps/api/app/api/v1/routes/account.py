from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.auth import User, UserPreferences, UserProfile
from app.schemas.account import (
    PreferencesResponse,
    PreferencesUpdate,
    ProfileResponse,
    ProfileUpdate,
)

router = APIRouter()


def _ensure_profile(db: Session, user: User) -> UserProfile:
    if user.profile is None:
        user.profile = UserProfile(user_id=user.id)
        db.flush()
    return user.profile


def _ensure_preferences(db: Session, user: User) -> UserPreferences:
    if user.preferences is None:
        user.preferences = UserPreferences(user_id=user.id)
        db.flush()
    return user.preferences


@router.put("/profile", response_model=ProfileResponse)
def update_profile(
    payload: ProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProfileResponse:
    profile = _ensure_profile(db, current_user)
    profile.display_name = payload.display_name
    profile.phone = payload.phone
    profile.avatar_url = payload.avatar_url
    db.commit()
    db.refresh(profile)
    return ProfileResponse.model_validate(profile)


@router.get("/preferences", response_model=PreferencesResponse)
def get_preferences(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PreferencesResponse:
    preferences = _ensure_preferences(db, current_user)
    db.commit()
    db.refresh(preferences)
    return PreferencesResponse.model_validate(preferences)


@router.put("/preferences", response_model=PreferencesResponse)
def update_preferences(
    payload: PreferencesUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PreferencesResponse:
    preferences = _ensure_preferences(db, current_user)
    preferences.home_city = payload.home_city
    preferences.language = payload.language
    preferences.budget = payload.budget
    preferences.travel_style = payload.travel_style
    preferences.interests = payload.interests
    preferences.constraints = payload.constraints
    preferences.wishlist = payload.wishlist
    preferences.saved_itinerary_refs = payload.saved_itinerary_refs
    db.commit()
    db.refresh(preferences)
    return PreferencesResponse.model_validate(preferences)
