from __future__ import annotations

from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class RegisterRequest(StrictModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=12, max_length=128)
    display_name: str = Field(min_length=1, max_length=80)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        value = value.strip().lower()
        local, separator, domain = value.partition("@")
        if not separator or not local or "." not in domain or any(char.isspace() for char in value):
            raise ValueError("Enter a valid email address.")
        return value


class LoginRequest(StrictModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()


class ProfileUpdate(StrictModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=80)
    preferred_currency: str | None = Field(default=None, min_length=3, max_length=3)

    @field_validator("preferred_currency")
    @classmethod
    def normalize_currency(cls, value: str | None) -> str | None:
        return value.upper() if value else value


class EmailChange(StrictModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_email: str = Field(min_length=3, max_length=254)

    @field_validator("new_email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        value = value.strip().lower()
        local, separator, domain = value.partition("@")
        if not separator or not local or "." not in domain or any(char.isspace() for char in value):
            raise ValueError("Enter a valid email address.")
        return value


class PasswordChange(StrictModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=12, max_length=128)


class ProductCreate(StrictModel):
    name: str = Field(min_length=1, max_length=180)
    category: str | None = Field(default=None, max_length=100)
    brand: str | None = Field(default=None, max_length=120)
    description: str = Field(default="", max_length=20000)
    short_description: str | None = Field(default=None, max_length=600)
    cost_price: Decimal = Field(ge=0, max_digits=18, decimal_places=4)
    selling_price: Decimal = Field(ge=0, max_digits=18, decimal_places=4)
    Color: str | None = Field(default=None, max_length=120)
    Size: str | None = Field(default=None, max_length=120)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    status: Literal["draft", "active", "archived"] = "draft"
    track_inventory: bool = True
    stock_quantity: int = Field(default=0, ge=0, le=2_147_483_647)
    weight: Decimal | None = Field(default=None, ge=0, max_digits=18, decimal_places=6)
    weight_unit: str | None = Field(default=None, max_length=12)
    low_stock_threshold: int = Field(default=0, ge=0, le=2_147_483_647)
    tags: list[str] = Field(default_factory=list, max_length=50)
    variations: dict[str, str] = Field(default_factory=dict)

    @field_validator("category", "brand", "Color", "Size", "weight_unit", "short_description")
    @classmethod
    def blank_to_none(cls, value: str | None) -> str | None:
        return value.strip() or None if value is not None else None

    @field_validator("currency")
    @classmethod
    def normalize_currency(cls, value: str | None) -> str | None:
        return value.upper() if value else None

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, values: list[str]) -> list[str]:
        cleaned = list(dict.fromkeys(tag.strip()[:80] for tag in values if tag.strip()))
        if len(cleaned) > 50:
            raise ValueError("Use no more than 50 tags.")
        return cleaned


class ProductPatch(StrictModel):
    name: str | None = Field(default=None, min_length=1, max_length=180)
    category: str | None = Field(default=None, max_length=100)
    brand: str | None = Field(default=None, max_length=120)
    description: str | None = Field(default=None, max_length=20000)
    short_description: str | None = Field(default=None, max_length=600)
    cost_price: Decimal | None = Field(default=None, ge=0, max_digits=18, decimal_places=4)
    selling_price: Decimal | None = Field(default=None, ge=0, max_digits=18, decimal_places=4)
    Color: str | None = Field(default=None, max_length=120)
    Size: str | None = Field(default=None, max_length=120)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    status: Literal["draft", "active", "archived"] | None = None
    track_inventory: bool | None = None
    stock_quantity: int | None = Field(default=None, ge=0, le=2_147_483_647)
    weight: Decimal | None = Field(default=None, ge=0, max_digits=18, decimal_places=6)
    weight_unit: str | None = Field(default=None, max_length=12)
    low_stock_threshold: int | None = Field(default=None, ge=0, le=2_147_483_647)
    tags: list[str] | None = Field(default=None, max_length=50)
    variations: dict[str, str] | None = None

    @field_validator("currency")
    @classmethod
    def normalize_currency(cls, value: str | None) -> str | None:
        return value.upper() if value else value


class StatusUpdate(StrictModel):
    status: Literal["draft", "active"]


class VariationCreate(StrictModel):
    display_name: str = Field(min_length=1, max_length=40)
    data_type: Literal["text"] = "text"


class VariationUpdate(StrictModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=40)
    active: bool | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: dict
