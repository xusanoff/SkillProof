import uuid
from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Depends, Response, UploadFile, status

from app.api.deps import CurrentUser, DbSession
from app.core.config import get_settings
from app.schemas.candidate import CandidateProfileOut, CandidateProfileUpdate
from app.schemas.verified_skill import VerifiedSkillOut, VerifiedSkillUpdate
from app.services import candidates, verified_skills
from app.services.storage import Storage, get_storage

router = APIRouter(prefix="/candidate", tags=["candidate"])
StorageDep = Annotated[Storage, Depends(get_storage)]


@router.get("/verified-skills", response_model=list[VerifiedSkillOut])
async def list_verified_skills(user: CurrentUser, session: DbSession) -> list[VerifiedSkillOut]:
    return await verified_skills.list_own(session, user)


@router.patch("/verified-skills/{verified_id}", response_model=VerifiedSkillOut)
async def update_verified_skill(
    verified_id: uuid.UUID, data: VerifiedSkillUpdate, user: CurrentUser, session: DbSession
) -> VerifiedSkillOut:
    return await verified_skills.set_public(session, user, verified_id, data.is_public)


@router.get("/profile", response_model=CandidateProfileOut)
async def get_profile(user: CurrentUser, session: DbSession) -> CandidateProfileOut:
    return await candidates.get_profile(session, user)


@router.put("/profile", response_model=CandidateProfileOut)
async def put_profile(
    data: CandidateProfileUpdate, user: CurrentUser, session: DbSession
) -> CandidateProfileOut:
    return await candidates.update_profile(session, user, data)


@router.post("/profile/resume", response_model=CandidateProfileOut)
async def upload_resume(
    file: UploadFile, user: CurrentUser, session: DbSession, storage: StorageDep
) -> CandidateProfileOut:
    # Read one byte past the limit so oversize files are rejected without buffering them fully.
    data = await file.read(get_settings().resume_max_bytes + 1)
    return await candidates.upload_resume(session, user, file.filename or "resume", data, storage)


@router.get("/profile/resume", response_class=Response)
async def download_resume(user: CurrentUser, session: DbSession, storage: StorageDep) -> Response:
    data, content_type, filename = await candidates.read_resume(session, user, storage)
    return Response(
        data,
        media_type=content_type,
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.delete("/profile/resume", status_code=status.HTTP_204_NO_CONTENT)
async def delete_resume(user: CurrentUser, session: DbSession, storage: StorageDep) -> None:
    await candidates.delete_resume(session, user, storage)
