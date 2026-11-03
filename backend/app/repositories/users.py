from __future__ import annotations

import uuid
from datetime import datetime, timezone

from ..security import hash_legacy_password, verify_password
from ..storage import CsvStore, CsvTransaction
from .variations import default_variation_rows


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def public_user(user: dict) -> dict:
    return {
        "id": user["id"],
        "email": user["email"],
        "display_name": user["display_name"],
        "preferred_currency": user["preferred_currency"],
        "created_at": user["created_at"],
        "updated_at": user["updated_at"],
    }


def user_by_email(store: CsvStore, email: str) -> dict | None:
    normalized = email.strip().lower()
    return next((row for row in store.read("users") if row["email"].lower() == normalized), None)


def validate_user(store: CsvStore, email: str, password: str) -> dict | None:
    """Validate credentials against the accounts persisted in users.csv."""
    user = user_by_email(store, email)
    if user is None or not verify_password(user.get("password_hash", ""), password):
        return None
    return user


def migrate_legacy_users(store: CsvStore) -> None:
    """Hash plaintext credentials and fill defaults in older users.csv rows."""
    with store.transaction() as tx:
        users = tx.read("users")
        changed = False
        for user in users:
            stored_password = user.get("password_hash", "")
            if stored_password and not stored_password.startswith("$"):
                user["password_hash"] = hash_legacy_password(stored_password)
                changed = True
            if not user.get("preferred_currency"):
                user["preferred_currency"] = "NGN"
                changed = True
            if not user.get("token_version"):
                user["token_version"] = "0"
                changed = True
            if not user.get("created_at"):
                user["created_at"] = utc_now()
                changed = True
            if not user.get("updated_at"):
                user["updated_at"] = user["created_at"]
                changed = True
        if changed:
            tx.write("users", users)


def user_by_id(store: CsvStore, user_id: str) -> dict | None:
    return next((row for row in store.read("users") if row["id"] == user_id), None)


def create_user(store: CsvStore, email: str, display_name: str, password_hash: str, currency: str) -> dict:
    stamp = utc_now()
    user = {
        "id": f"usr_{uuid.uuid4().hex}",
        "email": email.strip().lower(),
        "display_name": display_name.strip(),
        "password_hash": password_hash,
        "preferred_currency": currency,
        "token_version": "0",
        "created_at": stamp,
        "updated_at": stamp,
    }
    with store.transaction() as tx:
        users = tx.read("users")
        if any(row["email"].lower() == user["email"] for row in users):
            raise ValueError("An account with this email already exists.")
        variations = tx.read("variations")
        tx.write("users", [*users, user])
        tx.write("variations", [*variations, *default_variation_rows(user["id"], stamp)])
    return user


def update_user(store: CsvStore, user_id: str, **changes) -> dict:
    with store.transaction() as tx:
        users = tx.read("users")
        target = next((row for row in users if row["id"] == user_id), None)
        if not target:
            raise LookupError("Account not found.")
        for key, value in changes.items():
            if key in {"display_name", "preferred_currency"} and value is not None:
                target[key] = value
        target["updated_at"] = utc_now()
        tx.write("users", users)
        return target


def replace_password(store: CsvStore, user_id: str, password_hash: str) -> dict:
    with store.transaction() as tx:
        users = tx.read("users")
        target = next((row for row in users if row["id"] == user_id), None)
        if not target:
            raise LookupError("Account not found.")
        target["password_hash"] = password_hash
        target["token_version"] = str(int(target.get("token_version") or "0") + 1)
        target["updated_at"] = utc_now()
        tx.write("users", users)
        return target


def invalidate_tokens(store: CsvStore, user_id: str) -> dict:
    with store.transaction() as tx:
        users = tx.read("users")
        target = next((row for row in users if row["id"] == user_id), None)
        if not target:
            raise LookupError("Account not found.")
        target["token_version"] = str(int(target.get("token_version") or "0") + 1)
        target["updated_at"] = utc_now()
        tx.write("users", users)
        return target


def replace_email(store: CsvStore, user_id: str, email: str) -> dict:
    normalized = email.strip().lower()
    with store.transaction() as tx:
        users = tx.read("users")
        target = next((row for row in users if row["id"] == user_id), None)
        if not target:
            raise LookupError("Account not found.")
        if any(row["id"] != user_id and row["email"].lower() == normalized for row in users):
            raise ValueError("An account with this email already exists.")
        target["email"] = normalized
        target["token_version"] = str(int(target.get("token_version") or "0") + 1)
        target["updated_at"] = utc_now()
        tx.write("users", users)
        return target
