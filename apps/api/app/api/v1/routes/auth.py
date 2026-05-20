from fastapi import APIRouter, Body, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.rate_limit import RateLimiter, default_rate_limit_store
from app.core.security import (
    create_access_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    is_expired,
    token_expiry,
    utc_now,
    verify_password,
)
from app.core.settings import Settings, get_settings
from app.db.session import get_db
from app.models.auth import AuditLog, RefreshToken, User, UserPreferences, UserProfile
from app.schemas.auth import (
    LoginRequest,
    LogoutRequest,
    RefreshTokenRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)

router = APIRouter()
login_limiter = RateLimiter(default_rate_limit_store, max_attempts=10, window_seconds=60)
register_limiter = RateLimiter(default_rate_limit_store, max_attempts=5, window_seconds=300)


def _client_key(request: Request, action: str) -> str:
    host = request.client.host if request.client else "unknown"
    return f"{action}:{host}"


def _create_refresh_token(db: Session, user: User, settings: Settings) -> tuple[str, RefreshToken]:
    raw_token = generate_refresh_token()
    refresh_token = RefreshToken(
        user_id=user.id,
        token_hash=hash_refresh_token(raw_token),
        expires_at=token_expiry(settings.jwt_refresh_token_expire_days),
    )
    db.add(refresh_token)
    db.flush()
    return raw_token, refresh_token


def _token_response(db: Session, user: User, settings: Settings) -> TokenResponse:
    raw_refresh_token, _ = _create_refresh_token(db, user, settings)
    return TokenResponse(
        access_token=create_access_token(user.id, user.role, settings),
        refresh_token=raw_refresh_token,
        expires_in=settings.jwt_access_token_expire_minutes * 60,
        user=UserResponse.model_validate(user),
    )


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(
    payload: RegisterRequest,
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> TokenResponse:
    register_limiter.check(_client_key(request, "register"))

    existing_user = db.scalar(select(User).where(User.email == payload.email))
    if existing_user is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = User(email=payload.email, password_hash=hash_password(payload.password), role="user")
    db.add(user)
    db.flush()
    db.add(UserProfile(user_id=user.id, display_name=payload.display_name))
    db.add(UserPreferences(user_id=user.id))
    db.add(
        AuditLog(
            actor_user_id=user.id,
            action="auth.register",
            target_type="user",
            target_id=user.id,
        )
    )
    response = _token_response(db, user, settings)
    db.commit()
    return response


@router.post("/login", response_model=TokenResponse)
def login(
    payload: LoginRequest,
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> TokenResponse:
    login_limiter.check(_client_key(request, "login"))

    user = db.scalar(select(User).where(User.email == payload.email))
    if user is None or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    db.add(
        AuditLog(
            actor_user_id=user.id,
            action="auth.login",
            target_type="user",
            target_id=user.id,
        )
    )
    response = _token_response(db, user, settings)
    db.commit()
    return response


@router.post("/refresh", response_model=TokenResponse)
def refresh(
    payload: RefreshTokenRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> TokenResponse:
    token_hash = hash_refresh_token(payload.refresh_token)
    current_token = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    if current_token is None or current_token.revoked_at is not None or is_expired(current_token.expires_at):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    user = db.scalar(select(User).where(User.id == current_token.user_id, User.is_active.is_(True)))
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    current_token.revoked_at = utc_now()
    response = _token_response(db, user, settings)
    replacement = db.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(response.refresh_token))
    )
    current_token.replaced_by_token_id = replacement.id if replacement else None
    db.add(
        AuditLog(
            actor_user_id=user.id,
            action="auth.refresh",
            target_type="refresh_token",
            target_id=current_token.id,
        )
    )
    db.commit()
    return response


@router.post("/logout")
def logout(
    payload: LogoutRequest = Body(default_factory=LogoutRequest),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, bool]:
    if payload.refresh_token:
        token_hash = hash_refresh_token(payload.refresh_token)
        tokens = list(
            db.scalars(
                select(RefreshToken).where(
                    RefreshToken.user_id == current_user.id,
                    RefreshToken.token_hash == token_hash,
                    RefreshToken.revoked_at.is_(None),
                )
            )
        )
    else:
        tokens = list(
            db.scalars(
                select(RefreshToken).where(
                    RefreshToken.user_id == current_user.id,
                    RefreshToken.revoked_at.is_(None),
                )
            )
        )

    now = utc_now()
    for token in tokens:
        token.revoked_at = now

    db.add(
        AuditLog(
            actor_user_id=current_user.id,
            action="auth.logout",
            target_type="user",
            target_id=current_user.id,
        )
    )
    db.commit()
    return {"ok": True}


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)) -> UserResponse:
    return UserResponse.model_validate(current_user)
