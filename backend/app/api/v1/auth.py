from typing import Annotated, Any

from fastapi import APIRouter, BackgroundTasks, Depends, Request, Response, status

from app.api.deps import ACCESS_COOKIE, REFRESH_COOKIE, CurrentUser, DbSession, client_ip
from app.core.config import get_settings
from app.core.rate_limit import RateLimiter, get_rate_limiter
from app.schemas.auth import (
    DeleteAccountIn,
    ForgotPasswordIn,
    LoginIn,
    Me,
    MeUpdate,
    RegisterIn,
    ResetPasswordIn,
    TokenIn,
)
from app.services import auth as auth_service
from app.services import privacy
from app.services.email import EmailSender, get_email_sender, send_best_effort
from app.services.storage import Storage, get_storage

router = APIRouter(prefix="/auth", tags=["auth"])

Limiter = Annotated[RateLimiter, Depends(get_rate_limiter)]
Sender = Annotated[EmailSender, Depends(get_email_sender)]

# The refresh cookie is only needed by /auth/* calls. "/api" covers both the direct API
# path (/api/v1/auth/...) and the browser path through the Next proxy (/api/api/v1/...).
REFRESH_PATH = "/api"


def _set_session_cookies(response: Response, tokens: auth_service.SessionTokens) -> None:
    settings = get_settings()
    common = {"httponly": True, "secure": settings.cookie_secure, "samesite": "lax"}
    response.set_cookie(
        ACCESS_COOKIE,
        tokens.access_token,
        max_age=settings.access_token_minutes * 60,
        path="/",
        **common,  # type: ignore[arg-type]
    )
    response.set_cookie(
        REFRESH_COOKIE,
        tokens.refresh_token,
        max_age=settings.refresh_token_days * 86400,
        path=REFRESH_PATH,
        **common,  # type: ignore[arg-type]
    )


def _clear_session_cookies(response: Response) -> None:
    response.delete_cookie(ACCESS_COOKIE, path="/")
    response.delete_cookie(REFRESH_COOKIE, path=REFRESH_PATH)


@router.post("/register", response_model=Me, status_code=status.HTTP_201_CREATED)
async def register(
    data: RegisterIn,
    request: Request,
    response: Response,
    session: DbSession,
    limiter: Limiter,
    sender: Sender,
) -> Me:
    await limiter.check("register", client_ip(request), get_settings().rate_limit_register)
    user, tokens = await auth_service.register(session, data, sender)
    _set_session_cookies(response, tokens)
    return await auth_service.build_me(session, user)


@router.post("/login", response_model=Me)
async def login(
    data: LoginIn, request: Request, response: Response, session: DbSession, limiter: Limiter
) -> Me:
    rule = get_settings().rate_limit_login
    await limiter.check("login-ip", client_ip(request), rule)
    await limiter.check("login-email", data.email.lower(), rule)
    user, tokens = await auth_service.login(session, data.email, data.password)
    _set_session_cookies(response, tokens)
    return await auth_service.build_me(session, user)


@router.post("/refresh", response_model=Me)
async def refresh(request: Request, response: Response, session: DbSession) -> Me:
    try:
        user, tokens = await auth_service.refresh(session, request.cookies.get(REFRESH_COOKIE))
    except Exception:
        _clear_session_cookies(response)
        raise
    _set_session_cookies(response, tokens)
    return await auth_service.build_me(session, user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request, response: Response, session: DbSession) -> None:
    await auth_service.logout(session, request.cookies.get(REFRESH_COOKIE))
    _clear_session_cookies(response)


@router.get("/me", response_model=Me)
async def me(user: CurrentUser, session: DbSession) -> Me:
    return await auth_service.build_me(session, user)


@router.patch("/me", response_model=Me)
async def update_me(data: MeUpdate, user: CurrentUser, session: DbSession) -> Me:
    user = await auth_service.update_me(session, user, data)
    return await auth_service.build_me(session, user)


@router.post("/verify-email", status_code=status.HTTP_204_NO_CONTENT)
async def verify_email(data: TokenIn, session: DbSession) -> None:
    await auth_service.verify_email(session, data.token)


@router.post("/resend-verification", status_code=status.HTTP_204_NO_CONTENT)
async def resend_verification(
    user: CurrentUser, session: DbSession, limiter: Limiter, sender: Sender
) -> None:
    await limiter.check("resend", str(user.id), get_settings().rate_limit_password)
    await auth_service.resend_verification(session, user, sender)


@router.post("/password/forgot", status_code=status.HTTP_202_ACCEPTED)
async def forgot_password(
    data: ForgotPasswordIn,
    request: Request,
    background: BackgroundTasks,
    session: DbSession,
    limiter: Limiter,
    sender: Sender,
) -> None:
    await limiter.check("forgot", client_ip(request), get_settings().rate_limit_password)
    message = await auth_service.forgot_password(session, data.email)
    if message is not None:
        background.add_task(send_best_effort, sender, message)


@router.post("/password/reset", status_code=status.HTTP_204_NO_CONTENT)
async def reset_password(
    data: ResetPasswordIn, request: Request, session: DbSession, limiter: Limiter
) -> None:
    await limiter.check("reset", client_ip(request), get_settings().rate_limit_password)
    await auth_service.reset_password(session, data.token, data.password)


@router.get("/me/export")
async def export_me(
    request: Request, user: CurrentUser, session: DbSession, limiter: Limiter
) -> dict[str, Any]:
    await limiter.check("export", str(user.id), get_settings().rate_limit_export)
    return await privacy.export_account(session, user)


@router.post("/me/delete", status_code=status.HTTP_204_NO_CONTENT)
async def delete_me(
    data: DeleteAccountIn,
    request: Request,
    response: Response,
    user: CurrentUser,
    session: DbSession,
    limiter: Limiter,
    storage: Annotated[Storage, Depends(get_storage)],
) -> None:
    await limiter.check("delete_account", str(user.id), get_settings().rate_limit_password)
    await privacy.delete_account(session, storage, user, data.password)
    _clear_session_cookies(response)
