from __future__ import annotations

import csv
import io
from zipfile import ZipFile

from fastapi.testclient import TestClient
from openpyxl import load_workbook

from app.main import create_app
from conftest import create_product, product_payload, register


def test_variations_are_user_scoped_dynamic_and_preserved_after_deactivation(client: TestClient, app_settings):
    _user, headers = register(client)
    defaults = client.get("/api/v1/product-variations", headers=headers).json()["items"]
    assert {item["key"] for item in defaults} == {"Color", "Size"}

    added = client.post("/api/v1/product-variations", json={"display_name": "Material Type"}, headers=headers)
    assert added.status_code == 201, added.text
    definition = added.json()["item"]
    assert definition["key"] == "material_type"
    item = create_product(client, headers, "Cotton coat", variations={"material_type": "Organic cotton"})
    assert item["variations"]["material_type"] == "Organic cotton"

    renamed = client.patch(
        f"/api/v1/product-variations/{definition['id']}",
        json={"display_name": "Fabric Type"},
        headers=headers,
    )
    assert renamed.status_code == 200, renamed.text
    assert renamed.json()["item"]["key"] == "material_type"
    assert renamed.json()["item"]["display_name"] == "Fabric Type"

    removed = client.delete(f"/api/v1/product-variations/{definition['id']}", headers=headers)
    assert removed.status_code == 200
    assert removed.json()["historical_values_preserved"] is True
    active = client.get("/api/v1/product-variations", headers=headers).json()["items"]
    all_definitions = client.get("/api/v1/product-variations?include_inactive=true", headers=headers).json()["items"]
    assert "material_type" not in {value["key"] for value in active}
    assert next(value for value in all_definitions if value["id"] == definition["id"])["active"] is False

    # After deactivation, an ordinary edit that omits inactive dynamic fields retains their historical values.
    edited = client.patch(f"/api/v1/products/{item['id']}", json={"name": "Cotton coat updated"}, headers=headers)
    assert edited.status_code == 200, edited.text
    assert edited.json()["variations"]["material_type"] == "Organic cotton"

    _other, other_headers = register(client, "variation-thief@example.test", display_name="Other account")
    assert client.patch(
        f"/api/v1/product-variations/{definition['id']}",
        json={"display_name": "Stolen"},
        headers=other_headers,
    ).status_code == 404

    with TestClient(create_app(app_settings)) as restarted:
        persisted = restarted.get("/api/v1/product-variations?include_inactive=true", headers=headers).json()["items"]
        assert next(value for value in persisted if value["id"] == definition["id"])["active"] is False
        saved = restarted.get(f"/api/v1/products/{item['id']}", headers=headers).json()
        assert saved["variations"]["material_type"] == "Organic cotton"


def test_variations_reject_reserved_duplicate_or_unsafe_names(client: TestClient):
    _user, headers = register(client)
    for display_name in ("SKU", "Name", "Status", "Created At", "../path", "1starts-with-number"):
        response = client.post("/api/v1/product-variations", json={"display_name": display_name}, headers=headers)
        assert response.status_code == 422, (display_name, response.text)
    added = client.post("/api/v1/product-variations", json={"display_name": "Season"}, headers=headers)
    assert added.status_code == 201
    duplicate = client.post("/api/v1/product-variations", json={"display_name": "Season"}, headers=headers)
    assert duplicate.status_code == 409


def test_csv_and_xlsx_exports_are_real_filtered_owner_scoped_downloads(client: TestClient):
    _user, headers = register(client)
    _other, other_headers = register(client, "export-other@example.test", display_name="Other")
    first = create_product(
        client, headers, "=1+2 formula probe", category="Phones", selling_price="50.00",
        variations={"Color": "Navy"},
    )
    create_product(client, headers, "Canvas shirt", category="Apparel", selling_price="29.50")
    create_product(client, other_headers, "Private other product", category="Phones")

    csv_response = client.get("/api/v1/products/export?format=csv&category=Phones&min_price=40", headers=headers)
    assert csv_response.status_code == 200, csv_response.text
    assert "text/csv" in csv_response.headers["content-type"]
    assert csv_response.headers["content-disposition"].endswith(".csv\"")
    rows = list(csv.reader(io.StringIO(csv_response.content.decode("utf-8-sig"))))
    assert len(rows) == 2
    assert "SKU" in rows[0] and "Color" in rows[0]
    formula_column = rows[0].index("Product Name")
    assert rows[1][formula_column] == "'=1+2 formula probe"
    assert "Private other product" not in csv_response.content.decode("utf-8-sig")

    xlsx_response = client.get(f"/api/v1/products/export?format=xlsx&ids={first['id']}", headers=headers)
    assert xlsx_response.status_code == 200, xlsx_response.text
    assert "spreadsheetml" in xlsx_response.headers["content-type"]
    assert xlsx_response.content[:2] == b"PK"
    with ZipFile(io.BytesIO(xlsx_response.content)) as archive:
        assert "xl/workbook.xml" in archive.namelist()
    workbook = load_workbook(io.BytesIO(xlsx_response.content), read_only=True, data_only=False)
    sheet = workbook["Products"]
    headers_in_xlsx = [cell.value for cell in next(sheet.iter_rows(min_row=1, max_row=1))]
    assert "SKU" in headers_in_xlsx and "Color" in headers_in_xlsx
    assert sheet.max_row == 2
    name_cell = sheet.cell(2, headers_in_xlsx.index("Product Name") + 1)
    assert name_cell.data_type != "f"
    assert str(name_cell.value).startswith("'")
    workbook.close()

    no_auth = client.get("/api/v1/products/export?format=csv")
    assert no_auth.status_code == 401
