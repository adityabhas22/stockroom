from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ItemInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    sku: str = Field(min_length=2, max_length=32, pattern=r"^[A-Z0-9][A-Z0-9-]+$")
    name: str = Field(min_length=2, max_length=120)
    category: str = Field(min_length=1, max_length=40)
    location: str = Field(min_length=1, max_length=40)
    reorder_point: int = Field(default=5, ge=0, le=1000000, strict=True)


class ItemUpdate(ItemInput):
    version: int = Field(ge=1, strict=True)


class ItemOut(ItemInput):
    model_config = ConfigDict(from_attributes=True)
    id: int
    quantity: int
    version: int
    archived: bool
    created_at: datetime


class MovementInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    request_id: UUID
    delta: int = Field(ge=-1000000, le=1000000, strict=True)
    note: str = Field(min_length=3, max_length=240)

    @field_validator("delta")
    @classmethod
    def nonzero(cls, value):
        if value == 0:
            raise ValueError("Quantity change cannot be zero")
        return value


class MovementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    item_id: int
    request_id: str
    delta: int
    balance: int
    note: str
    created_at: datetime


class LoginInput(BaseModel):
    password: str = Field(min_length=1, max_length=256)
