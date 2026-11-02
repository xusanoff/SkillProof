from typing import Annotated

from pydantic import AfterValidator, StringConstraints

from app.core.errors import AppError


def _country(v: str | None) -> str | None:
    if v is None:
        return None
    if len(v) != 2 or not v.isalpha():
        raise ValueError("country must be an ISO 3166-1 alpha-2 code")
    return v.upper()


def _currency(v: str) -> str:
    if len(v) != 3 or not v.isalpha():
        raise ValueError("currency must be an ISO 4217 code")
    return v.upper()


CountryCode = Annotated[str | None, AfterValidator(_country)]
CurrencyCode = Annotated[str, AfterValidator(_currency)]
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]
Password = Annotated[str, StringConstraints(min_length=8, max_length=128)]

__all__ = ["AppError", "CountryCode", "CurrencyCode", "Password", "ShortText"]
