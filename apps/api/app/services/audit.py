from sqlalchemy.orm import Session

from app.models.auth import AuditLog, User


def add_audit_log(
    db: Session,
    actor: User,
    action: str,
    target_type: str,
    target_id: str | None,
    metadata: dict[str, object] | None = None,
) -> None:
    db.add(
        AuditLog(
            actor_user_id=actor.id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            metadata_json=metadata or {},
        )
    )
