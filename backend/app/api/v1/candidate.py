from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Depends, Response, UploadFile, status

from app.api.deps import CurrentUser, DbSession
from app.core.config import get_settings
from app.schemas.candidate import CandidateProfileOut, CandidateProfileUpdate
from app.services import candidates
from app.services.storage import Storage, get_storage

router = APIRouter(prefix="/candidate", tags=["candidate"])
StorageDep = Annotated[Storage, Depends(get_storage)]


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
