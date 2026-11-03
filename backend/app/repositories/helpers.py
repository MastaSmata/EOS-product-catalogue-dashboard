from __future__ import annotations

import json
from decimal import Decimal, InvalidOperation


def json_cell(value: str | None, fallback):
    if not value:
        return fallback
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, type(fallback)) else fallback
    except (json.JSONDecodeError, TypeError):
        return fallback


def csv_decimal(value: Decimal | str | None) -> str:
    if value is None or value == "":
        return ""
    try:
        return format(Decimal(str(value)), "f")
    except InvalidOperation as exc:
        raise ValueError("Invalid decimal value.") from exc


def json_dump(value) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
