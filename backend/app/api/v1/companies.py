import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Response, UploadFile, status

from app.api.deps import CurrentUser, DbSession
from app.core.config import get_settings
from app.schemas.company import (
    CompanyCreate,
    CompanyOut,
    CompanyPublic,
    CompanyUpdate,
    InvitationCreate,
    InvitationOut,
    InvitationPublic,
    MemberOut,
)
from app.services import companies
from app.services.email import EmailSender, get_email_sender
from app.services.storage import Storage, get_storage

router = APIRouter(tags=["companies"])
StorageDep = Annotated[Storage, Depends(get_storage)]
Sender = Annotated[EmailSender, Depends(get_email_sender)]


@router.post("/companies", response_model=CompanyOut, status_code=status.HTTP_201_CREATED)
async def create_company(data: CompanyCreate, user: CurrentUser, session: DbSession) -> CompanyOut:
    return await companies.create_company(session, user, data)


@router.get("/companies/mine", response_model=list[CompanyOut])
async def my_companies(user: CurrentUser, session: DbSession) -> list[CompanyOut]:
    return await companies.list_mine(session, user)


@router.get("/companies/by-slug/{slug}", response_model=CompanyPublic)
async def company_by_slug(slug: str, session: DbSession) -> CompanyPublic:
    return await companies.get_by_slug(session, slug)


@router.get("/companies/{company_id}", response_model=CompanyOut)
async def get_company(company_id: uuid.UUID, user: CurrentUser, session: DbSession) -> CompanyOut:
    company, role = await companies.get_membership(session, company_id, user)
    return companies.to_out(company, role)


@router.patch("/companies/{company_id}", response_model=CompanyOut)
async def update_company(
    company_id: uuid.UUID, data: CompanyUpdate, user: CurrentUser, session: DbSession
) -> CompanyOut:
    return await companies.update_company(session, company_id, user, data)


@router.post("/companies/{company_id}/logo", response_model=CompanyOut)
async def upload_logo(
    company_id: uuid.UUID,
    file: UploadFile,
    user: CurrentUser,
    session: DbSession,
    storage: StorageDep,
) -> CompanyOut:
    data = await file.read(get_settings().logo_max_bytes + 1)
    return await companies.set_logo(session, company_id, user, data, storage)


@router.get("/companies/{company_id}/logo", response_class=Response)
async def get_logo(company_id: uuid.UUID, session: DbSession, storage: StorageDep) -> Response:
    data, content_type = await companies.read_logo(session, company_id, storage)
    return Response(
        data,
        media_type=content_type,
        headers={"Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff"},
    )


@router.get("/companies/{company_id}/members", response_model=list[MemberOut])
async def list_members(
    company_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> list[MemberOut]:
    return await companies.list_members(session, company_id, user)


@router.delete("/companies/{company_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    company_id: uuid.UUID, user_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> None:
    await companies.remove_member(session, company_id, user, user_id)


@router.post(
    "/companies/{company_id}/invitations",
    response_model=InvitationOut,
    status_code=status.HTTP_201_CREATED,
)
async def invite(
    company_id: uuid.UUID,
    data: InvitationCreate,
    user: CurrentUser,
    session: DbSession,
    sender: Sender,
) -> InvitationOut:
    return await companies.create_invitation(session, company_id, user, data.email, sender)


@router.get("/companies/{company_id}/invitations", response_model=list[InvitationOut])
async def list_invitations(
    company_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> list[InvitationOut]:
    return await companies.list_invitations(session, company_id, user)


@router.delete(
    "/companies/{company_id}/invitations/{invitation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def revoke_invitation(
    company_id: uuid.UUID, invitation_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> None:
    await companies.revoke_invitation(session, company_id, user, invitation_id)


@router.get("/invitations/{token}", response_model=InvitationPublic)
async def get_invitation(token: str, session: DbSession) -> InvitationPublic:
    return await companies.get_invitation(session, token)


@router.post("/invitations/{token}/accept", response_model=CompanyOut)
async def accept_invitation(token: str, user: CurrentUser, session: DbSession) -> CompanyOut:
    return await companies.accept_invitation(session, token, user)
