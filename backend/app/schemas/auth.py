import uuid
from datetime import datetime
from typing import Annotated, Literal
from zoneinfo import available_timezones

from pydantic import AfterValidator, BaseModel, ConfigDict, EmailStr, StringConstraints

from app.models.enums import Locale, MemberRole, UserRole
from app.schemas.common import Password


def _timezone(v: str) -> str:
    if v not in available_timezones():
        raise ValueError("unknown timezone")
    return v


Timezone = Annotated[str, AfterValidator(_timezone)]
FullName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


class RegisterIn(BaseModel):
    email: EmailStr
    password: Password
    full_name: FullName
    role: Literal["candidate", "hr"]
    locale: Locale = Locale.uz
    timezone: Timezone = "Asia/Tashkent"


class LoginIn(BaseModel):
    email: EmailStr
    password: Annotated[str, StringConstraints(max_length=128)]


class MeUpdate(BaseModel):
    full_name: FullName | None = None
    locale: Locale | None = None
    timezone: Timezone | None = None


class TokenIn(BaseModel):
    token: Annotated[str, StringConstraints(min_length=10, max_length=200)]


class ForgotPasswordIn(BaseModel):
    email: EmailStr


class ResetPasswordIn(BaseModel):
    token: Annotated[str, StringConstraints(min_length=10, max_length=200)]
    password: Password


class MeCompany(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    member_role: MemberRole


class Me(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    full_name: str
    role: UserRole
    locale: Locale
    timezone: str
    is_email_verified: bool
    created_at: datetime
    companies: list[MeCompany]
