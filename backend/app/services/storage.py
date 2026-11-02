"""File storage behind a small interface. Local disk by default (DECISIONS D-004)."""

import uuid
from pathlib import Path
from typing import Protocol

from app.core.config import Settings, get_settings


class Storage(Protocol):
    async def save(self, prefix: str, extension: str, data: bytes) -> str: ...
    async def read(self, key: str) -> bytes: ...
    async def delete(self, key: str) -> None: ...


class LocalStorage:
    def __init__(self, root: str) -> None:
        self.root = Path(root).resolve()

    def _path(self, key: str) -> Path:
        path = (self.root / key).resolve()
        if not path.is_relative_to(self.root):
            raise ValueError("invalid storage key")
        return path

    async def save(self, prefix: str, extension: str, data: bytes) -> str:
        key = f"{prefix}/{uuid.uuid4().hex}{extension}"
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return key

    async def read(self, key: str) -> bytes:
        return self._path(key).read_bytes()

    async def delete(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)


def build_storage(settings: Settings) -> Storage:
    if settings.storage_backend == "local":
        return LocalStorage(settings.storage_local_dir)
    raise NotImplementedError("S3 storage is added when an S3-compatible service is chosen")


def get_storage() -> Storage:
    return build_storage(get_settings())
