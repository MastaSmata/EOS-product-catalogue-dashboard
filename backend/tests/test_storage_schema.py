from __future__ import annotations

import csv
import json

from app.schema import CSV_TABLES, SCHEMA_PATH
from app.storage import CsvStore
from conftest import register


def test_canonical_schema_keys_and_csv_headers_are_the_same_contract(tmp_path):
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    field_keys = [field["key"] for field in schema["fields"]]
    assert field_keys[:19] == [
        "sku", "name", "slug", "description", "short_description", "category", "brand",
        "cost_price", "selling_price", "Color", "Size", "currency", "status", "track_inventory",
        "stock_quantity", "weight", "weight_unit", "created_at", "updated_at",
    ]
    assert "deleted_at" in field_keys
    store = CsvStore(tmp_path / "tables")
    for table, header in CSV_TABLES.items():
        with (store.root / f"{table}.csv").open(encoding="utf-8", newline="") as file:
            rows = csv.reader(file)
            assert next(rows) == header
            assert next(rows, None) is None


def test_registered_password_is_argon2_hash_and_account_rows_persist(client):
    _response, headers = register(client)
    users = client.app.state.store.read("users")
    assert len(users) == 1
    row = users[0]
    assert row["password_hash"].startswith("$argon2id$")
    assert "Correct-Horse-Battery-7" not in str(row)
    assert client.get("/api/v1/auth/me", headers=headers).status_code == 200
