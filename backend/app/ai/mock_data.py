"""Deterministic, schema-valid sample data for any Pydantic model (used by the mock LLM)."""

import types
from enum import Enum
from typing import Any, Literal, Union, get_args, get_origin

import annotated_types
from pydantic import BaseModel
from pydantic.fields import FieldInfo
from pydantic_core import PydanticUndefined


def build_sample(model: type[BaseModel]) -> dict[str, Any]:
    return {name: _field_value(f) for name, f in model.model_fields.items()}


def _field_value(field: FieldInfo) -> Any:
    if field.default is not PydanticUndefined:
        return field.default
    if field.default_factory is not None:
        return field.default_factory()  # type: ignore[call-arg]
    return _value_for(field.annotation, field.metadata)


def _value_for(tp: Any, metadata: list[Any]) -> Any:
    origin = get_origin(tp)
    if origin in (Union, types.UnionType):
        args = [a for a in get_args(tp) if a is not type(None)]
        return None if len(args) < len(get_args(tp)) else _value_for(args[0], metadata)
    if origin is Literal:
        return get_args(tp)[0]
    if origin in (list, set, tuple):
        return []
    if origin is dict:
        return {}
    if isinstance(tp, type):
        if issubclass(tp, BaseModel):
            return build_sample(tp)
        if issubclass(tp, Enum):
            return next(iter(tp)).value
        if issubclass(tp, bool):
            return False
        if issubclass(tp, int | float):
            return _lower_bound(metadata, tp)
        if issubclass(tp, str):
            return "mock"
    return None


def _lower_bound(metadata: list[Any], tp: type) -> int | float:
    for m in metadata:
        if isinstance(m, annotated_types.Ge):
            return tp(m.ge)  # type: ignore[no-any-return]
        if isinstance(m, annotated_types.Gt):
            return tp(m.gt) + (1 if tp is int else 0.01)  # type: ignore[no-any-return]
    return tp(0)  # type: ignore[no-any-return]
