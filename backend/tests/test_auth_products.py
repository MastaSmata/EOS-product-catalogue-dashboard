from __future__ import annotations

import csv
import re
from concurrent.futures import ThreadPoolExecutor

from fastapi.testclient import TestClient

from app.main import create_app
from app.storage import CsvStore
from conftest import create_product, product_payload, register


def test_phone_sku_sequence_immutability_soft_delete_and_restart(client: TestClient, app_settings):
    body, headers = register(client)
    assert body["user"]["preferred_currency"] == "NGN"
    assert client.get("/api/v1/auth/me").status_code == 401

    created = [create_product(client, headers, f"Phone {number}") for number in range(1, 11)]
    assert re.fullmatch(r"pho-0010-[a-z0-9]{3}", created[9]["sku"])
    assert len({product["sku"] for product in created}) == 10
    assert created[0]["currency"] == "NGN"
    assert created[0]["slug"] == "phone-1"

    # Client SKU values are rejected at the API boundary and never replace the saved identifier.
    response = client.patch(f"/api/v1/products/{created[0]['id']}", json={"sku": "pho-9999-abc"}, headers=headers)
    assert response.status_code == 422
    updated = client.patch(
        f"/api/v1/products/{created[0]['id']}",
        json={"name": "Updated phone"},
        headers=headers,
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["sku"] == created[0]["sku"]
    assert updated.json()["selling_price"] == "24.9900"

    # A different merchant cannot read, mutate, or export this account's records.
    _other, other_headers = register(client, "another@example.test", display_name="Other merchant")
    assert client.get(f"/api/v1/products/{created[0]['id']}", headers=other_headers).status_code == 404
    assert client.patch(f"/api/v1/products/{created[0]['id']}", json={"name": "Intrusion"}, headers=other_headers).status_code == 404
    other_csv = client.get("/api/v1/products/export?format=csv", headers=other_headers)
    assert other_csv.status_code == 200
    assert b"Phone 1" not in other_csv.content

    deleted = client.delete(f"/api/v1/products/{created[0]['id']}", headers=headers)
    assert deleted.status_code == 200
    assert deleted.json()["deletion_mode"] == "soft"
    assert deleted.json()["product"]["status"] == "archived"
    assert len(client.get("/api/v1/products", headers=headers).json()["items"]) == 9

    # Restart the app on the same on-disk store: the tenth issuance remains recorded and is not reused.
    with TestClient(create_app(app_settings)) as restarted:
        assert restarted.get("/api/v1/auth/me", headers=headers).status_code == 200
        eleventh = create_product(restarted, headers, "Phone 11")
        assert re.fullmatch(r"pho-0011-[a-z0-9]{3}", eleventh["sku"])
        with (app_settings.data_dir / "issued_skus.csv").open(encoding="utf-8", newline="") as file:
            issued = list(csv.DictReader(file))
        assert len([row for row in issued if row["user_id"] == body["user"]["id"]]) == 11


def test_nullable_category_and_short_or_empty_prefix_fallbacks(client: TestClient):
    _body, headers = register(client)
    short = create_product(client, headers, "Short category", category="AB")
    blank = create_product(client, headers, "No category", category=None)
    assert short["sku"].startswith("abx-0001-")
    assert blank["category"] is None
    assert blank["sku"].startswith("cat-0001-")


def test_currency_preferences_validate_and_seed_new_products(client: TestClient):
    _body, headers = register(client)
    update = client.patch("/api/v1/auth/profile", json={"preferred_currency": "ghs"}, headers=headers)
    assert update.status_code == 200, update.text
    assert update.json()["user"]["preferred_currency"] == "GHS"
    created = create_product(client, headers, "Cedi-price product", category=None)
    assert created["currency"] == "GHS"
    assert client.patch("/api/v1/auth/profile", json={"preferred_currency": "ZZZ"}, headers=headers).status_code == 422
    assert client.get("/api/v1/auth/me", headers=headers).json()["user"]["preferred_currency"] == "GHS"


def test_password_change_and_logout_invalidate_old_access_tokens(client: TestClient):
    _body, original_headers = register(client)
    assert client.post("/api/v1/auth/logout", headers=original_headers).status_code == 200
    assert client.get("/api/v1/auth/me", headers=original_headers).status_code == 401

    logged_in = client.post("/api/v1/auth/login", json={"email": "merchant@example.test", "password": "Correct-Horse-Battery-7"})
    assert logged_in.status_code == 200
    headers = {"Authorization": f"Bearer {logged_in.json()['access_token']}"}
    changed = client.post(
        "/api/v1/auth/password",
        json={"current_password": "Correct-Horse-Battery-7", "new_password": "Different-Correct-9-Phrase"},
        headers=headers,
    )
    assert changed.status_code == 200, changed.text
    new_headers = {"Authorization": f"Bearer {changed.json()['access_token']}"}
    assert client.get("/api/v1/auth/me", headers=headers).status_code == 401
    assert client.get("/api/v1/auth/me", headers=new_headers).status_code == 200
    assert client.post("/api/v1/auth/login", json={"email": "merchant@example.test", "password": "Correct-Horse-Battery-7"}).status_code == 401
    assert client.post("/api/v1/auth/login", json={"email": "merchant@example.test", "password": "Different-Correct-9-Phrase"}).status_code == 200


def test_same_category_concurrent_creations_reserve_unique_skus(app_settings):
    with TestClient(create_app(app_settings)) as setup:
        _body, headers = register(setup)
    auth = headers["Authorization"]

    def create_one(index: int) -> dict:
        with TestClient(create_app(app_settings)) as local_client:
            response = local_client.post("/api/v1/products", json=product_payload(f"Concurrent {index}"), headers={"Authorization": auth})
            assert response.status_code == 201, response.text
            return response.json()

    with ThreadPoolExecutor(max_workers=5) as pool:
        created = list(pool.map(create_one, range(10)))
    assert len({item["sku"] for item in created}) == 10
    assert sorted(int(item["sku"].split("-")[1]) for item in created) == list(range(1, 11))


def test_unrecognized_product_fields_are_rejected_not_silently_saved(client: TestClient):
    _body, headers = register(client)
    response = client.post(
        "/api/v1/products",
        json={**product_payload(), "client_generated_sku": "bad"},
        headers=headers,
    )
    assert response.status_code == 422
    assert client.get("/api/v1/products", headers=headers).json()["total"] == 0


def test_email_change_requires_password_rejects_duplicate_and_refreshes_token(client: TestClient):
    body, headers = register(client)
    bad_password = client.post(
        "/api/v1/auth/email",
        json={"new_email": "new@example.test", "current_password": "wrong-password"},
        headers=headers,
    )
    assert bad_password.status_code == 400

    changed = client.post(
        "/api/v1/auth/email",
        json={"new_email": " NEW@EXAMPLE.TEST ", "current_password": "Correct-Horse-Battery-7"},
        headers=headers,
    )
    assert changed.status_code == 200, changed.text
    assert changed.json()["user"]["email"] == "new@example.test"
    fresh_headers = {"Authorization": f"Bearer {changed.json()['access_token']}"}
    assert client.get("/api/v1/auth/me", headers=headers).status_code == 401
    assert client.get("/api/v1/auth/me", headers=fresh_headers).status_code == 200
    assert client.post("/api/v1/auth/login", json={"email": body["user"]["email"], "password": "Correct-Horse-Battery-7"}).status_code == 401
    assert client.post("/api/v1/auth/login", json={"email": "new@example.test", "password": "Correct-Horse-Battery-7"}).status_code == 200

    _other, other_headers = register(client, "occupied@example.test", display_name="Other merchant")
    duplicate = client.post(
        "/api/v1/auth/email",
        json={"new_email": "occupied@example.test", "current_password": "Correct-Horse-Battery-7"},
        headers=fresh_headers,
    )
    assert duplicate.status_code == 409
