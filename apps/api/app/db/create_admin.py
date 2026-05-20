import os
import sys

from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.auth import AuditLog, User, UserPreferences, UserProfile


def main() -> None:
    email = os.environ.get("ADMIN_EMAIL", "").strip().lower()
    password = os.environ.get("ADMIN_PASSWORD", "")
    role = os.environ.get("ADMIN_ROLE", "admin").strip().lower()

    if not email:
        raise SystemExit("ADMIN_EMAIL is required")
    if len(password) < 8:
        raise SystemExit("ADMIN_PASSWORD must be at least 8 characters")
    if role not in {"editor", "admin", "root"}:
        raise SystemExit("ADMIN_ROLE must be editor, admin, or root")

    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == email))
        if user is None:
            user = User(email=email, password_hash=hash_password(password), role=role)
            db.add(user)
            db.flush()
            db.add(UserProfile(user_id=user.id, display_name="Admin"))
            db.add(UserPreferences(user_id=user.id))
            action = "admin.create"
        else:
            user.password_hash = hash_password(password)
            user.role = role
            user.is_active = True
            action = "admin.update"

        db.add(
            AuditLog(
                actor_user_id=user.id,
                action=action,
                target_type="user",
                target_id=user.id,
                metadata_json={"role": role},
            )
        )
        db.commit()

    print(f"Admin ready: {email} ({role})")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        raise
