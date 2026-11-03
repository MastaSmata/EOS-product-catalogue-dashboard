from __future__ import annotations

import re
import secrets
import unicodedata
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import UploadFile

from .config import Settings
from .media import MediaError, MediaManager
from .repositories.helpers import json_cell
from .repositories.products import get_product_row, list_product_rows
from .repositories.variations import active_variation_keys
from .schema import PRODUCT_FIELD_KEYS
from .serializers import product_from_row, product_row_base
from .storage import CsvStore

_ALPHANUM = "abcdefghijklmnopqrstuvwxyz0123456789"
_SLUG_CHARS = re.compile(r"[^a-z0-9]+")


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def normalize_category(value: str) -> str:
    ascii_text = unicodedata.normalize("NFKD", value.strip()).encode("ascii", "ignore").decode("ascii").lower()
    return " ".join(ascii_text.split())


def category_prefix(value: str) -> str:
    letters = "".join(char for char in normalize_category(value) if char.isalpha())
    if not letters:
        return "cat"
    return (letters[:3] + "xxx")[:3]


def _slug_base(value: str) -> str:
    return _SLUG_CHARS.sub("-", unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii").lower()).strip("-") or "product"


def _slug_for(rows: list[dict[str, str]], user_id: str, name: str, excluding_id: str | None = None) -> str:
    used = {row.get("slug", "").casefold() for row in rows if row["user_id"] == user_id and row["id"] != excluding_id}
    base = _slug_base(name)
    slug = base
    suffix = 2
    while slug.casefold() in used:
        slug = f"{base}-{suffix}"
        suffix += 1
    return slug


def _is_active(raw: str | None) -> bool:
    return (raw or "").strip().lower() == "true"


def _decimal_places(value: Decimal) -> int:
    exponent = value.as_tuple().exponent
    return max(0, -exponent) if isinstance(exponent, int) else 0


class ProductService:
    def __init__(self, store: CsvStore, settings: Settings, media: MediaManager):
        self.store = store
        self.settings = settings
        self.media = media

    def _reserve_sku(self, user_id: str, category: str | None, product_id: str) -> tuple[str, int]:
        normalized = normalize_category(category or "")
        prefix = category_prefix(category or "")
        with self.store.transaction() as tx:
            sequences = tx.read("sequences")
            issued = tx.read("issued_skus")
            products = tx.read("products")
            sequence_row = next((row for row in sequences if row["user_id"] == user_id and row["normalized_category"] == normalized), None)
            if sequence_row:
                sequence = int(sequence_row["next_sequence"])
            else:
                historic = [
                    int(row["sequence"])
                    for row in issued
                    if row["user_id"] == user_id and row["normalized_category"] == normalized and row["sequence"].isdigit()
                ]
                for row in products:
                    if row["user_id"] == user_id and normalize_category(row.get("category", "")) == normalized:
                        match = re.fullmatch(r"[a-z]{3}-(\d+)-[a-z0-9]{3}", row.get("sku", ""))
                        if match:
                            historic.append(int(match.group(1)))
                sequence = max(historic, default=0) + 1

            previously_used = {row["sku"].casefold() for row in issued if row["user_id"] == user_id}
            previously_used.update(row.get("sku", "").casefold() for row in products if row["user_id"] == user_id)
            for _ in range(500):
                suffix = "".join(secrets.choice(_ALPHANUM) for _ in range(3))
                sku = f"{prefix}-{sequence:04d}-{suffix}"
                if sku.casefold() not in previously_used:
                    break
            else:
                raise RuntimeError("Could not reserve a unique SKU after repeated collisions.")

            next_sequence = sequence + 1
            new_sequence = {"user_id": user_id, "normalized_category": normalized, "prefix": prefix, "next_sequence": str(next_sequence)}
            if sequence_row:
                sequences = [new_sequence if row is sequence_row else row for row in sequences]
            else:
                sequences.append(new_sequence)
            issued.append({"sku": sku, "user_id": user_id, "normalized_category": normalized,
                           "sequence": str(sequence), "issued_at": utc_now(), "product_id": product_id})
            tx.write("sequences", sequences)
            tx.write("issued_skus", issued)
        return sku, sequence

    def _validate_product(self, data: dict, user: dict, active_keys: set[str], old: dict | None = None) -> dict:
        result = {**(old or {}), **data}
        result["name"] = str(result.get("name") or "").strip()
        if not result["name"]:
            raise ValueError("Product name is required.")
        if len(result["name"]) > 180:
            raise ValueError("Product name must be 180 characters or fewer.")
        category = result.get("category")
        if category is not None:
            category = str(category).strip() or None
        result["category"] = category

        currency = str(result.get("currency") or user.get("preferred_currency") or "NGN").upper()
        if currency not in self.settings.allowed_currencies:
            raise ValueError("Choose a supported ISO currency from your account settings.")
        result["currency"] = currency

        if old is None and result.get("status") == "archived":
            raise ValueError("Create a product as Draft or Active; archive it after creation if needed.")
        if result.get("status") not in {"draft", "active", "archived"}:
            raise ValueError("Status must be draft, active, or archived.")
        if result.get("status") == "archived" and not (old or {}).get("deleted_at"):
            if data.get("status") == "archived":
                raise ValueError("Use the delete action to archive a product.")

        for key in ("cost_price", "selling_price"):
            value = result.get(key)
            try:
                number = Decimal(str(value))
            except Exception as exc:
                raise ValueError(f"{key.replace('_', ' ').title()} must be a valid number.") from exc
            if not number.is_finite() or number < 0 or _decimal_places(number) > 4:
                raise ValueError(f"{key.replace('_', ' ').title()} must be non-negative with at most four decimal places.")
            result[key] = number

        for key in ("stock_quantity", "low_stock_threshold"):
            value = result.get(key, 0)
            if isinstance(value, bool) or not str(value).isdigit() or int(value) > 2_147_483_647:
                raise ValueError(f"{key.replace('_', ' ').title()} must be a non-negative whole number.")
            result[key] = int(value)
        result["track_inventory"] = bool(result.get("track_inventory", True))

        weight = result.get("weight")
        if weight in (None, ""):
            result["weight"] = None
        else:
            try:
                result["weight"] = Decimal(str(weight))
            except Exception as exc:
                raise ValueError("Weight must be a valid non-negative number.") from exc
            if not result["weight"].is_finite() or result["weight"] < 0 or _decimal_places(result["weight"]) > 6:
                raise ValueError("Weight must be non-negative with at most six decimal places.")
        result["weight_unit"] = (str(result.get("weight_unit") or "").strip() or None)
        for key in ("brand", "Color", "Size", "short_description"):
            result[key] = str(result.get(key) or "").strip() or None
        result["description"] = str(result.get("description") or "")
        if len(result["description"]) > 20_000:
            raise ValueError("Description must be 20,000 characters or fewer.")
        result["tags"] = list(dict.fromkeys(str(tag).strip()[:80] for tag in (result.get("tags") or []) if str(tag).strip()))[:50]

        current_variations = dict((old or {}).get("variations") or {})
        supplied_variations = data.get("variations")
        if supplied_variations is not None:
            for key, value in supplied_variations.items():
                if key in active_keys:
                    current_variations[key] = str(value)[:500]
                elif key in current_variations and current_variations[key] == value:
                    continue
                else:
                    raise ValueError(f"The variation '{key}' is not currently active for this account.")
        for key in list(current_variations):
            if key in active_keys and key not in (supplied_variations or {}) and old is None:
                current_variations.pop(key, None)
        for key in ("Color", "Size"):
            prior = (old or {}).get(key)
            incoming = data.get(key)
            if key not in active_keys:
                if incoming is not None and incoming != prior:
                    raise ValueError(f"The {key} variation is inactive in account settings.")
                result[key] = prior
            else:
                result[key] = str(result.get(key) or "").strip() or None
        result["variations"] = current_variations
        return result

    def _public(self, row: dict[str, str]) -> dict:
        return product_from_row(row, self.media)

    async def create(self, user: dict, data: dict, uploads: list[UploadFile] | None = None, keep_media_ids: list[str] | None = None) -> dict:
        user_id = user["id"]
        active_keys = active_variation_keys(self.store, user_id)
        product = self._validate_product(data, user, active_keys)
        product_id = f"prd_{uuid.uuid4().hex}"
        sku, _sequence = self._reserve_sku(user_id, product["category"], product_id)
        stamp = utc_now()
        product.update({"id": product_id, "user_id": user_id, "sku": sku, "created_at": stamp, "updated_at": stamp,
                       "deleted_at": None, "slug": "", "currency": product["currency"]})
        uploads = uploads or []
        media_batch = await self.media.prepare_uploads(user_id, product_id, sku, uploads, [])
        product["media"] = media_batch.records
        try:
            media_batch.commit()
            with self.store.transaction() as tx:
                rows = tx.read("products")
                product["slug"] = _slug_for(rows, user_id, product["name"])
                rows.append(product_row_base(product, user_id, media_batch.records))
                tx.write("products", rows)
        except Exception:
            media_batch.rollback()
            raise
        return self._public(product_row_base(product, user_id, media_batch.records))

    def list(self, user_id: str, *, q: str = "", category: str | None = None, status: str | None = None,
             stock: str | None = None, low_stock: bool | None = None, min_price: Decimal | None = None,
             max_price: Decimal | None = None, sort: str = "name", direction: str = "asc", include_deleted: bool = False,
             variation_filters: dict[str, str] | None = None) -> dict:
        rows = list_product_rows(self.store, user_id, include_deleted=include_deleted)
        products = [self._public(row) for row in rows]
        query = q.strip().casefold()
        if query:
            products = [product for product in products if query in " ".join([
                str(product.get("name") or ""), str(product.get("sku") or ""), str(product.get("category") or ""),
                str(product.get("brand") or ""), str(product.get("description") or ""), str(product.get("short_description") or ""),
                " ".join(product.get("tags") or []), " ".join(str(value) for value in (product.get("variations") or {}).values()),
                str(product.get("Color") or ""), str(product.get("Size") or ""),
            ]).casefold()]
        if category:
            products = [product for product in products if str(product.get("category") or "").casefold() == category.casefold()]
        if status:
            products = [product for product in products if product.get("status") == status]
        for key, expected in (variation_filters or {}).items():
            products = [
                product for product in products
                if str((product.get("Color") if key == "Color" else product.get("Size") if key == "Size" else (product.get("variations") or {}).get(key)) or "").casefold() == str(expected).casefold()
            ]
        if stock == "out":
            products = [product for product in products if product.get("track_inventory") and product.get("stock_quantity") == 0]
        elif stock == "low":
            products = [product for product in products if product.get("track_inventory") and 0 < product.get("stock_quantity", 0) <= product.get("low_stock_threshold", 0)]
        elif stock == "in":
            products = [product for product in products if not product.get("track_inventory") or product.get("stock_quantity", 0) > 0]
        if low_stock is True:
            products = [product for product in products if product.get("track_inventory") and 0 < product.get("stock_quantity", 0) <= product.get("low_stock_threshold", 0)]
        elif low_stock is False:
            products = [product for product in products if not (product.get("track_inventory") and 0 < product.get("stock_quantity", 0) <= product.get("low_stock_threshold", 0))]
        if min_price is not None:
            products = [product for product in products if Decimal(str(product["selling_price"])) >= min_price]
        if max_price is not None:
            products = [product for product in products if Decimal(str(product["selling_price"])) <= max_price]

        sortable = {key for key in PRODUCT_FIELD_KEYS if key not in {"description", "short_description", "deleted_at"}}
        sortable.update({"low_stock_threshold", "brand", "tags"})
        if sort not in sortable:
            raise ValueError("Unsupported sort field.")
        reverse = direction == "desc"
        def sort_key(product: dict):
            value = product.get(sort)
            if value is None:
                return (1, "")
            if sort in {"cost_price", "selling_price", "stock_quantity", "weight", "low_stock_threshold"}:
                try:
                    return (0, Decimal(str(value)))
                except Exception:
                    return (1, Decimal(0))
            if sort in {"created_at", "updated_at"}:
                return (0, str(value))
            if sort == "track_inventory":
                return (0, bool(value))
            return (0, str(value).casefold())
        products.sort(key=sort_key, reverse=reverse)
        return {"items": products, "total": len(products)}

    def get(self, user_id: str, product_id: str) -> dict | None:
        row = get_product_row(self.store, user_id, product_id)
        return self._public(row) if row else None

    async def update(self, user: dict, product_id: str, changes: dict, uploads: list[UploadFile] | None = None,
                     keep_media_ids: list[str] | None = None) -> dict | None:
        user_id = user["id"]
        active_keys = active_variation_keys(self.store, user_id)
        rows = self.store.read("products")
        row = next((item for item in rows if item["id"] == product_id and item["user_id"] == user_id and not item.get("deleted_at")), None)
        if not row:
            return None
        original_row = dict(row)
        old = product_from_row(row)
        product = self._validate_product(changes, user, active_keys, old)
        product["id"] = old["id"]
        product["user_id"] = user_id
        product["sku"] = old["sku"]
        product["created_at"] = old["created_at"]
        product["updated_at"] = utc_now()
        product["deleted_at"] = old.get("deleted_at")
        product["slug"] = _slug_for(rows, user_id, product["name"], excluding_id=product_id)
        prior_media = old.get("media") or []
        keep_ids = {item["id"] for item in prior_media} if keep_media_ids is None else set(keep_media_ids)
        if not keep_ids.issubset({item["id"] for item in prior_media}):
            raise ValueError("The media selection contains an item that does not belong to this product.")
        kept_media = [item for item in prior_media if item["id"] in keep_ids]
        media_batch = await self.media.prepare_uploads(user_id, product_id, product["sku"], uploads or [], kept_media)
        if len(media_batch.records) > self.settings.max_media_per_product:
            media_batch.rollback()
            raise MediaError(f"A product can have no more than {self.settings.max_media_per_product} media files.")
        replacement = product_row_base(product, user_id, media_batch.records)
        try:
            media_batch.commit()
            with self.store.transaction() as tx_write:
                current_rows = tx_write.read("products")
                found = False
                for index, current in enumerate(current_rows):
                    if current["id"] == product_id and current["user_id"] == user_id and not current.get("deleted_at"):
                        if current != original_row:
                            raise ValueError("This product changed while it was being edited. Reload it and retry your changes.")
                        current_rows[index] = replacement
                        found = True
                        break
                if not found:
                    raise LookupError("Product not found.")
                tx_write.write("products", current_rows)
        except Exception:
            media_batch.rollback()
            raise
        removed_media = [item for item in prior_media if item["id"] not in keep_ids]
        media_batch.cleanup_removed(removed_media)
        return self._public(replacement)

    def set_status(self, user_id: str, product_id: str, status: str) -> dict | None:
        if status not in {"draft", "active"}:
            raise ValueError("Status must be draft or active.")
        with self.store.transaction() as tx:
            rows = tx.read("products")
            product = next((row for row in rows if row["id"] == product_id and row["user_id"] == user_id and not row.get("deleted_at")), None)
            if not product:
                return None
            product["status"] = status
            product["updated_at"] = utc_now()
            tx.write("products", rows)
            return self._public(product)

    def soft_delete(self, user_id: str, product_id: str) -> dict | None:
        with self.store.transaction() as tx:
            rows = tx.read("products")
            product = next((row for row in rows if row["id"] == product_id and row["user_id"] == user_id and not row.get("deleted_at")), None)
            if not product:
                return None
            stamp = utc_now()
            product["status"] = "archived"
            product["deleted_at"] = stamp
            product["updated_at"] = stamp
            tx.write("products", rows)
            return self._public(product)

    def get_media_metadata(self, user_id: str, product_id: str, media_id: str) -> dict | None:
        product = get_product_row(self.store, user_id, product_id)
        if not product:
            return None
        media_items = json_cell(product.get("media_json"), [])
        return next((item for item in media_items if item.get("id") == media_id), None)
