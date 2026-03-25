from __future__ import annotations

from hmac import compare_digest
from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.models.identity import AuthUser
from app.db.session import get_db_session


class AuthenticatedUserContext(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: UUID
    email: str
    role: str = "user"
    age_verified: bool = True


def parse_bool_header(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.lower() in {"1", "true", "yes", "on"}


async def get_current_user_context(
    internal_secret: Annotated[str | None, Header(alias="X-Lumina-Internal-Secret")] = None,
    user_id: Annotated[str | None, Header(alias="X-Lumina-User-Id")] = None,
    user_email: Annotated[str | None, Header(alias="X-Lumina-User-Email")] = None,
    user_role: Annotated[str | None, Header(alias="X-Lumina-User-Role")] = "user",
    age_verified: Annotated[str | None, Header(alias="X-Lumina-Age-Verified")] = "false",
) -> AuthenticatedUserContext:
    settings = get_settings()

    if not internal_secret or not compare_digest(internal_secret, settings.internal_api_shared_secret):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing or invalid internal auth signature.")

    if not user_id or not user_email:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing authenticated user headers.")

    try:
        parsed_user_id = UUID(user_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authenticated user id must be a UUID.") from exc

    parsed_age_verified = parse_bool_header(age_verified, default=False)
    if not parsed_age_verified:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Age verification is required.")

    return AuthenticatedUserContext(
        id=parsed_user_id,
        email=user_email,
        role=user_role or "user",
        age_verified=parsed_age_verified,
    )


async def require_admin_user_context(
    current_user: Annotated[AuthenticatedUserContext, Depends(get_current_user_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> AuthenticatedUserContext:
    if current_user.role == "admin":
        return current_user

    auth_user = await session.get(AuthUser, current_user.id)
    if auth_user is not None and auth_user.role == "admin":
        return current_user.model_copy(update={"role": "admin"})

    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access is required.")
