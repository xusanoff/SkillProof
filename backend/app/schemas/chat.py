import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints


class MessageIn(BaseModel):
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)]
    client_id: uuid.UUID


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    sequence: int
    sender_id: uuid.UUID | None
    kind: Literal["message", "status"]
    text: str | None
    application_status: str | None
    created_at: datetime


class ThreadOut(BaseModel):
    application_id: uuid.UUID
    vacancy_title: str
    company_id: uuid.UUID
    company_name: str
    candidate_id: uuid.UUID
    candidate_name: str
    application_status: str
    cover_note: str | None
    unread_count: int
    last_message: MessageOut | None


class ThreadPage(BaseModel):
    items: list[ThreadOut]
    total: int
    page: int
    page_size: int


class MessagePage(BaseModel):
    thread: ThreadOut
    items: list[MessageOut]
    has_more: bool


class ReadIn(BaseModel):
    through_sequence: Annotated[int, Field(ge=1)]
