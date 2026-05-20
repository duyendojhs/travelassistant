from enum import Enum

from fastapi import HTTPException, status


class Role(str, Enum):
    guest = "guest"
    user = "user"
    editor = "editor"
    admin = "admin"
    root = "root"


ROLE_ORDER: dict[Role, int] = {
    Role.guest: 0,
    Role.user: 10,
    Role.editor: 20,
    Role.admin: 30,
    Role.root: 40,
}


def role_allows(actual: str, required: Role) -> bool:
    try:
        actual_role = Role(actual)
    except ValueError:
        return False
    return ROLE_ORDER[actual_role] >= ROLE_ORDER[required]


def require_role(actual: str, required: Role) -> None:
    if not role_allows(actual, required):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Requires {required.value} role",
        )
