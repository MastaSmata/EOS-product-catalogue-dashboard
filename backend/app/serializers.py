from __future__ import annotations

from decimal import Decimal, InvalidOperation

from .schema import BOOLEAN_FIELDS, DECIMAL_FIELDS, INTEGER_FIELDS, PRODUCT_FIELD_KEYS
from .repositories.helpers import json_cell


def _as_bool(value: str | None) -> bool:
    return str(value or "").strip().lower() in {"true", "1", "yes"}


def _as_int(value: str | None, fallback: int = 0) -> int:
    try:
        return int(value) if value not in (None, "") else fallback
    except (TypeError, ValueError):
        return fallback


def _as_decimal_text(value: str | None) -> str | None:
    if value in (None, ""):
        return None
    try:
        return format(Decimal(value), "f")
    except InvalidOperation:
        return None


def product_from_row(row: dict[str, str], media_manager=None) -> dict:
    result: dict = {"id": row["id"]}
    for key in PRODUCT_FIELD_KEYS:
        raw = row.get(key, "")
        if key in DECIMAL_FIELDS:
            result[key] = _as_decimal_text(raw)
        elif key in INTEGER_FIELDS:
            result[key] = _as_int(raw)
        elif key in BOOLEAN_FIELDS:
            result[key] = _as_bool(raw)
        else:
            result[key] = raw or None if key in {"short_description", "category", "brand", "Color", "Size", "weight", "weight_unit", "deleted_at"} else raw
    result["low_stock_threshold"] = _as_int(row.get("low_stock_threshold"), 0)
    result["tags"] = json_cell(row.get("tags_json"), [])
    result["variations"] = json_cell(row.get("variations_json"), {})
    media = json_cell(row.get("media_json"), [])
    if media_manager:
        result["media"] = [media_manager.public_media(item, row["user_id"], row["id"]) for item in media]
    else:
        result["media"] = media
    return result


def product_row_base(product: dict, user_id: str, media: list[dict]) -> dict:
    from .repositories.helpers import csv_decimal, json_dump

    row = {"id": product["id"], "user_id": user_id}
    for key in PRODUCT_FIELD_KEYS:
        value = product.get(key)
        if key in DECIMAL_FIELDS:
            row[key] = csv_decimal(value)
        elif key in BOOLEAN_FIELDS:
            row[key] = "true" if bool(value) else "false"
        elif key in INTEGER_FIELDS:
            row[key] = str(value if value is not None else 0)
        else:
            row[key] = "" if value is None else str(value)
    row["low_stock_threshold"] = str(product.get("low_stock_threshold") or 0)
    row["tags_json"] = json_dump(product.get("tags") or [])
    row["media_json"] = json_dump(media)
    row["variations_json"] = json_dump(product.get("variations") or {})
    return row
