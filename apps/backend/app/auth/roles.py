"""Role constants and helpers for Orbit RBAC."""

ROLE_OWNER = "owner"
ROLE_ADMIN = "admin"
ROLE_NETWORK_ADMIN = "network_admin"

ALL_ROLES = [ROLE_OWNER, ROLE_ADMIN, ROLE_NETWORK_ADMIN]

ROLE_ALIASES = {
    ROLE_ADMIN: {ROLE_NETWORK_ADMIN},
    ROLE_NETWORK_ADMIN: {ROLE_ADMIN},
}


def has_role(user_roles: list[str], required: str | list[str]) -> bool:
    """Check if user has the required role(s). Owner has implicit access to everything."""
    normalized_roles = set(user_roles or [])
    if ROLE_OWNER in normalized_roles:
        return True

    required_list = required if isinstance(required, list) else [required]
    for role in required_list:
        if role in normalized_roles:
            return True
        aliases = ROLE_ALIASES.get(role, set())
        if aliases.intersection(normalized_roles):
            return True
    return False
