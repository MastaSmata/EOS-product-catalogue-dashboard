from __future__ import annotations

import json
from pathlib import Path

SCHEMA_PATH = Path(__file__).resolve().parents[2] / "shared" / "product-schema.json"
CANONICAL_SCHEMA = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
PRODUCT_FIELDS = CANONICAL_SCHEMA["fields"]
PRODUCT_FIELD_KEYS = [field["key"] for field in PRODUCT_FIELDS]
FIELD_BY_KEY = {field["key"]: field for field in PRODUCT_FIELDS}
DECIMAL_FIELDS = {field["key"] for field in PRODUCT_FIELDS if field["type"] == "decimal"}
INTEGER_FIELDS = {field["key"] for field in PRODUCT_FIELDS if field["type"] == "integer"}
BOOLEAN_FIELDS = {field["key"] for field in PRODUCT_FIELDS if field["type"] == "boolean"}

PRODUCT_EXTRA_COLUMNS = [
    "low_stock_threshold", "tags_json", "media_json", "variations_json",
]
PRODUCT_COLUMNS = ["id", "user_id", *PRODUCT_FIELD_KEYS, *PRODUCT_EXTRA_COLUMNS]
USER_COLUMNS = ["id", "email", "display_name", "password_hash", "preferred_currency", "token_version", "created_at", "updated_at"]
VARIATION_COLUMNS = ["id", "user_id", "key", "display_name", "data_type", "active", "standard", "created_at", "updated_at"]
SEQUENCE_COLUMNS = ["user_id", "normalized_category", "prefix", "next_sequence"]
ISSUED_SKU_COLUMNS = ["sku", "user_id", "normalized_category", "sequence", "issued_at", "product_id"]
CSV_TABLES = {
    "products": PRODUCT_COLUMNS,
    "users": USER_COLUMNS,
    "variations": VARIATION_COLUMNS,
    "sequences": SEQUENCE_COLUMNS,
    "issued_skus": ISSUED_SKU_COLUMNS,
}
