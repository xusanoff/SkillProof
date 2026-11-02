from datetime import datetime
from typing import Annotated, Self

from pydantic import BaseModel, Field, StringConstraints, model_validator

from app.schemas.common import CountryCode, CurrencyCode


class ResumeInfo(BaseModel):
    filename: str
    size_bytes: int
    content_type: str
    uploaded_at: datetime


class CandidateProfileUpdate(BaseModel):
    headline: Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)] | None = None
    country: CountryCode = None
    city: Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)] | None = None
    experience_years: Annotated[int, Field(ge=0, le=60)] | None = None
    about: Annotated[str, StringConstraints(max_length=5000)] | None = None
    desired_salary_min: Annotated[int, Field(ge=0)] | None = None
    desired_salary_max: Annotated[int, Field(ge=0)] | None = None
    currency: CurrencyCode = "UZS"
    open_to_work: bool = True

    @model_validator(mode="after")
    def _salary_range(self) -> Self:
        lo, hi = self.desired_salary_min, self.desired_salary_max
        if lo is not None and hi is not None and lo > hi:
            raise ValueError("desired_salary_min must not exceed desired_salary_max")
        return self


class CandidateProfileOut(CandidateProfileUpdate):
    resume: ResumeInfo | None = None
