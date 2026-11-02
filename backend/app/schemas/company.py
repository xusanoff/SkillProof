import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, EmailStr, HttpUrl, StringConstraints

from app.models.enums import MemberRole
from app.schemas.common import CountryCode

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=200)]
Short = Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)]
Description = Annotated[str, StringConstraints(max_length=10000)]


class CompanyCreate(BaseModel):
    name: Name
    description: Description | None = None
    website: HttpUrl | None = None
    industry: Short | None = None
    country: CountryCode = None
    city: Short | None = None


class CompanyUpdate(BaseModel):
    name: Name | None = None
    description: Description | None = None
    website: HttpUrl | None = None
    industry: Short | None = None
    country: CountryCode = None
    city: Short | None = None


class CompanyPublic(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    description: str | None
    website: str | None
    industry: str | None
    country: str | None
    city: str | None
    logo_url: str | None
    is_verified: bool
    created_at: datetime


class CompanyOut(CompanyPublic):
    member_role: MemberRole


class MemberOut(BaseModel):
    user_id: uuid.UUID
    email: str
    full_name: str
    member_role: MemberRole
    joined_at: datetime


class InvitationCreate(BaseModel):
    email: EmailStr


class InvitationOut(BaseModel):
    id: uuid.UUID
    email: str
    member_role: MemberRole
    invited_by_name: str | None
    created_at: datetime
    expires_at: datetime


class InvitationCompany(BaseModel):
    name: str
    slug: str
    logo_url: str | None


class InvitationPublic(BaseModel):
    company: InvitationCompany
    email: str
    status: Literal["pending", "accepted", "expired", "revoked"]
