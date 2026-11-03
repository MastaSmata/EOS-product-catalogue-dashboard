from __future__ import annotations

from ..storage import CsvStore


def list_product_rows(store: CsvStore, user_id: str, *, include_deleted: bool = False) -> list[dict[str, str]]:
    rows = [row for row in store.read("products") if row["user_id"] == user_id]
    if not include_deleted:
        rows = [row for row in rows if not row.get("deleted_at")]
    return rows


def get_product_row(store: CsvStore, user_id: str, product_id: str, *, include_deleted: bool = False) -> dict[str, str] | None:
    return next((row for row in list_product_rows(store, user_id, include_deleted=include_deleted) if row["id"] == product_id), None)
