from datetime import datetime, timedelta, timezone
from hashlib import sha256
import secrets
from typing import Any

import jwt
from pwdlib import PasswordHash

from app.core.settings import Settings

ALGORITHM = "HS256"
ACCESS_TOKEN_TYPE = "access"

password_hasher = PasswordHash.recommended()


class TokenError(Exception):
    pass


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return password_hasher.verify(password, password_hash)


def create_access_token(user_id: str, role: str, settings: Settings) -> str:
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=settings.jwt_access_token_expire_minutes)
    payload: dict[str, Any] = {
        "sub": user_id,
        "role": role,
        "typ": ACCESS_TOKEN_TYPE,
        "iat": now,
        "exp": expires_at,
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=ALGORITHM)


def decode_access_token(token: str, settings: Settings) -> dict[str, Any]:
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[ALGORITHM])
    except jwt.PyJWTError as exc:
        raise TokenError("Invalid or expired access token") from exc

    if payload.get("typ") != ACCESS_TOKEN_TYPE or not isinstance(payload.get("sub"), str):
        raise TokenError("Invalid access token claims")
    return payload


def generate_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def hash_refresh_token(token: str) -> str:
    return sha256(token.encode("utf-8")).hexdigest()


def token_expiry(days: int) -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=days)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def is_expired(expires_at: datetime) -> bool:
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    return expires_at <= utc_now()
