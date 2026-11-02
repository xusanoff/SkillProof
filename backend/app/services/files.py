"""Upload validation by magic bytes (never trust the client's content type)."""

from dataclasses import dataclass

from app.core.errors import AppError


@dataclass(frozen=True)
class FileKind:
    extension: str
    content_type: str


_ZIP = b"PK\x03\x04"
_OLE = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"

RESUME_KINDS = {
    ".pdf": FileKind(".pdf", "application/pdf"),
    ".docx": FileKind(
        ".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ),
    ".doc": FileKind(".doc", "application/msword"),
}
IMAGE_KINDS = {
    "png": FileKind(".png", "image/png"),
    "jpeg": FileKind(".jpg", "image/jpeg"),
    "webp": FileKind(".webp", "image/webp"),
}


def check_size(data: bytes, max_bytes: int) -> None:
    if not data:
        raise AppError("empty_file", "The file is empty", 400)
    if len(data) > max_bytes:
        raise AppError("file_too_large", "File is too large", 413, {"max_bytes": max_bytes})


def detect_resume(data: bytes, filename: str) -> FileKind:
    name = filename.lower()
    if data.startswith(b"%PDF-"):
        return RESUME_KINDS[".pdf"]
    if data.startswith(_ZIP) and name.endswith(".docx"):
        return RESUME_KINDS[".docx"]
    if data.startswith(_OLE) and name.endswith(".doc"):
        return RESUME_KINDS[".doc"]
    raise AppError("unsupported_file_type", "Upload a PDF, DOC or DOCX file", 400)


def detect_image(data: bytes) -> FileKind:
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return IMAGE_KINDS["png"]
    if data.startswith(b"\xff\xd8\xff"):
        return IMAGE_KINDS["jpeg"]
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return IMAGE_KINDS["webp"]
    raise AppError("unsupported_file_type", "Upload a PNG, JPEG or WEBP image", 400)


def safe_filename(filename: str) -> str:
    cleaned = "".join(c for c in filename if c.isalnum() or c in " ._-()").strip()
    return cleaned[:200] or "file"
