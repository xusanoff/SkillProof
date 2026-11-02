from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import NotFoundError, PermissionDeniedError
from app.models import CandidateProfile, User
from app.models.enums import UserRole
from app.schemas.candidate import CandidateProfileOut, CandidateProfileUpdate, ResumeInfo
from app.services import audit
from app.services.files import check_size, detect_resume, safe_filename
from app.services.storage import Storage

_PROFILE_FIELDS = tuple(CandidateProfileUpdate.model_fields)


def _require_candidate(user: User) -> None:
    if user.role is not UserRole.candidate:
        raise PermissionDeniedError("Only candidate accounts have a candidate profile")


async def _get_or_new(session: AsyncSession, user: User) -> CandidateProfile:
    profile = await session.get(CandidateProfile, user.id)
    if profile is None:
        profile = CandidateProfile(user_id=user.id, currency="UZS", open_to_work=True)
        session.add(profile)
    return profile


def to_out(profile: CandidateProfile) -> CandidateProfileOut:
    resume = None
    if profile.resume_key and profile.resume_uploaded_at:
        resume = ResumeInfo(
            filename=profile.resume_filename or "resume",
            size_bytes=profile.resume_size_bytes or 0,
            content_type=profile.resume_content_type or "application/octet-stream",
            uploaded_at=profile.resume_uploaded_at,
        )
    data = {f: getattr(profile, f) for f in _PROFILE_FIELDS}
    return CandidateProfileOut(**data, resume=resume)


async def get_profile(session: AsyncSession, user: User) -> CandidateProfileOut:
    _require_candidate(user)
    profile = await session.get(CandidateProfile, user.id)
    return to_out(profile) if profile else CandidateProfileOut()


async def update_profile(
    session: AsyncSession, user: User, data: CandidateProfileUpdate
) -> CandidateProfileOut:
    _require_candidate(user)
    profile = await _get_or_new(session, user)
    for field, value in data.model_dump().items():
        setattr(profile, field, value)
    await session.commit()
    await session.refresh(profile)
    return to_out(profile)


async def upload_resume(
    session: AsyncSession, user: User, filename: str, data: bytes, storage: Storage
) -> CandidateProfileOut:
    _require_candidate(user)
    check_size(data, get_settings().resume_max_bytes)
    kind = detect_resume(data, filename)
    profile = await _get_or_new(session, user)
    old_key = profile.resume_key
    profile.resume_key = await storage.save(f"resumes/{user.id}", kind.extension, data)
    profile.resume_filename = safe_filename(filename)
    profile.resume_content_type = kind.content_type
    profile.resume_size_bytes = len(data)
    profile.resume_uploaded_at = datetime.now(UTC)
    audit.record(session, user.id, "candidate.resume_upload", "user", user.id)
    await session.commit()
    if old_key:
        await storage.delete(old_key)
    await session.refresh(profile)
    return to_out(profile)


async def read_resume(
    session: AsyncSession, user: User, storage: Storage
) -> tuple[bytes, str, str]:
    _require_candidate(user)
    profile = await session.get(CandidateProfile, user.id)
    if profile is None or not profile.resume_key:
        raise NotFoundError("Resume not found")
    data = await storage.read(profile.resume_key)
    return (
        data,
        profile.resume_content_type or "application/octet-stream",
        (profile.resume_filename or "resume"),
    )


async def delete_resume(session: AsyncSession, user: User, storage: Storage) -> None:
    _require_candidate(user)
    profile = await session.get(CandidateProfile, user.id)
    if profile is None or not profile.resume_key:
        return
    key = profile.resume_key
    profile.resume_key = profile.resume_filename = profile.resume_content_type = None
    profile.resume_size_bytes = None
    profile.resume_uploaded_at = None
    await session.commit()
    await storage.delete(key)
