from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.errors import AppError, PermissionDeniedError
from app.core.security import decode_access_token
from app.models import User
from app.models.enums import UserRole

ACCESS_COOKIE = "sp_access"
REFRESH_COOKIE = "sp_refresh"

DbSession = Annotated[AsyncSession, Depends(get_session)]


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


async def get_current_user(request: Request, session: DbSession) -> User:
    token = request.cookies.get(ACCESS_COOKIE)
    user_id = decode_access_token(token) if token else None
    user = await session.get(User, user_id) if user_id else None
    if user is None or not user.is_active:
        raise AppError("unauthorized", "Sign in to continue", 401)
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


async def get_optional_user(request: Request, session: DbSession) -> User | None:
    """The signed-in user if the access cookie is valid, else None (public endpoints)."""
    token = request.cookies.get(ACCESS_COOKIE)
    user_id = decode_access_token(token) if token else None
    user = await session.get(User, user_id) if user_id else None
    return user if user is not None and user.is_active else None


OptionalUser = Annotated[User | None, Depends(get_optional_user)]


def require_role(*roles: UserRole):  # type: ignore[no-untyped-def]
    async def dep(user: CurrentUser) -> User:
        if user.role not in roles:
            raise PermissionDeniedError("Your account type cannot do this")
        return user

    return Depends(dep)
