from __future__ import annotations

import re
import unicodedata
import uuid
from datetime import datetime, timezone

from ..schema import PRODUCT_FIELD_KEYS
from ..storage import CsvStore

_RESERVED = {key.casefold() for key in PRODUCT_FIELD_KEYS} | {
    "id", "user_id", "owner_id", "media", "tags", "variations", "variations_json", "low_stock_threshold",
}
_DISPLAY_NAME = re.compile(r"^[A-Za-z][A-Za-z0-9 _-]{0,39}$")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def normalize_key(display_name: str) -> str:
    ascii_text = unicodedata.normalize("NFKD", display_name).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "_", ascii_text.strip().lower()).strip("_")


def validate_display_name(display_name: str) -> str:
    cleaned = " ".join(display_name.strip().split())
    if not _DISPLAY_NAME.fullmatch(cleaned):
        raise ValueError("Use a variation name beginning with a letter and containing only letters, numbers, spaces, _ or - (40 characters max).")
    return cleaned


def default_variation_rows(user_id: str, stamp: str | None = None) -> list[dict]:
    stamp = stamp or now_iso()
    return [
        {"id": f"var_{uuid.uuid4().hex}", "user_id": user_id, "key": key, "display_name": key,
         "data_type": "text", "active": "true", "standard": "true", "created_at": stamp, "updated_at": stamp}
        for key in ("Color", "Size")
    ]


def public_variation(row: dict) -> dict:
    return {
        "id": row["id"], "key": row["key"], "display_name": row["display_name"],
        "data_type": row["data_type"], "active": row["active"].lower() == "true",
        "standard": row["standard"].lower() == "true", "created_at": row["created_at"], "updated_at": row["updated_at"],
    }


def list_variations(store: CsvStore, user_id: str, *, active_only: bool = True) -> list[dict]:
    rows = [row for row in store.read("variations") if row["user_id"] == user_id]
    if active_only:
        rows = [row for row in rows if row["active"].lower() == "true"]
    rows.sort(key=lambda row: (row["standard"] != "true", row["display_name"].casefold()))
    return [public_variation(row) for row in rows]


def active_variation_keys(store: CsvStore, user_id: str) -> set[str]:
    return {row["key"] for row in list_variations(store, user_id, active_only=True)}


def add_variation(store: CsvStore, user_id: str, display_name: str) -> dict:
    label = validate_display_name(display_name)
    key = normalize_key(label)
    if not key or key in _RESERVED or key.casefold() in _RESERVED:
        raise ValueError("That variation name conflicts with a reserved product field.")
    stamp = now_iso()
    with store.transaction() as tx:
        rows = tx.read("variations")
        existing = next((row for row in rows if row["user_id"] == user_id and row["key"].casefold() == key.casefold()), None)
        if existing:
            if existing["active"].lower() == "true":
                raise ValueError("A variation with that internal key already exists.")
            existing["active"] = "true"
            existing["display_name"] = label
            existing["updated_at"] = stamp
            result = existing
        else:
            result = {"id": f"var_{uuid.uuid4().hex}", "user_id": user_id, "key": key,
                      "display_name": label, "data_type": "text", "active": "true", "standard": "false",
                      "created_at": stamp, "updated_at": stamp}
            rows.append(result)
        tx.write("variations", rows)
    return public_variation(result)


def update_variation(store: CsvStore, user_id: str, variation_id: str, *, display_name: str | None = None, active: bool | None = None) -> dict:
    with store.transaction() as tx:
        rows = tx.read("variations")
        target = next((row for row in rows if row["id"] == variation_id and row["user_id"] == user_id), None)
        if not target:
            raise LookupError("Variation not found.")
        if display_name is not None:
            target["display_name"] = validate_display_name(display_name)
        if active is not None:
            target["active"] = "true" if active else "false"
        target["updated_at"] = now_iso()
        tx.write("variations", rows)
        return public_variation(target)


def deactivate_variation(store: CsvStore, user_id: str, variation_id: str) -> dict:
    with store.transaction() as tx:
        rows = tx.read("variations")
        target = next((row for row in rows if row["id"] == variation_id and row["user_id"] == user_id), None)
        if not target:
            raise LookupError("Variation not found.")
        target["active"] = "false"
        target["updated_at"] = now_iso()
        tx.write("variations", rows)
        return public_variation(target)
