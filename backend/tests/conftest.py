from __future__ import annotations

import os
import sys
import tempfile
from dataclasses import replace
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

PROJECT_ROOT = Path(__file__).resolve().parents[2]
# Importing the ASGI app creates its default store; keep that bootstrap isolated from real project data.
_TEST_BOOTSTRAP = Path(tempfile.mkdtemp(prefix="eos-pcm-test-bootstrap-"))
os.environ["PCM_JWT_SECRET"] = "test-only-secret-for-isolated-pcm-test-bootstrap"
os.environ["PCM_DATA_DIR"] = str(_TEST_BOOTSTRAP / "data")
os.environ["PCM_MEDIA_DIR"] = str(_TEST_BOOTSTRAP / "media")
BACKEND_ROOT = PROJECT_ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.config import Settings  # noqa: E402
from app.main import create_app  # noqa: E402


@pytest.fixture
def app_settings(tmp_path: Path) -> Settings:
    return replace(
        Settings.from_env(),
        data_dir=tmp_path / "data",
        media_dir=tmp_path / "uploads",
        jwt_secret="isolated-tests-only-secret-with-at-least-forty-chars",
        max_image_bytes=2 * 1024 * 1024,
        max_video_bytes=3 * 1024 * 1024,
        max_video_seconds=5,
    )


@pytest.fixture
def client(app_settings: Settings):
    with TestClient(create_app(app_settings)) as test_client:
        yield test_client


def register(client: TestClient, email: str = "merchant@example.test", *, display_name: str = "PCM Merchant"):
    response = client.post(
        "/api/v1/auth/register",
        json={"email": email, "display_name": display_name, "password": "Correct-Horse-Battery-7"},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    return body, {"Authorization": f"Bearer {body['access_token']}"}


def product_payload(name: str = "Demo phone", *, category: str | None = "Phones", **overrides) -> dict:
    data = {
        "name": name,
        "category": category,
        "brand": "Groundtaq Demo",
        "description": "A safe local-test record.",
        "short_description": "Test item",
        "cost_price": "12.1250",
        "selling_price": "24.9900",
        "Color": "Black",
        "Size": "M",
        "status": "draft",
        "track_inventory": True,
        "stock_quantity": 8,
        "low_stock_threshold": 2,
        "tags": ["smoke", "demo"],
    }
    data.update(overrides)
    return data


def create_product(client: TestClient, headers: dict[str, str], name: str = "Demo phone", **overrides) -> dict:
    response = client.post("/api/v1/products", json=product_payload(name, **overrides), headers=headers)
    assert response.status_code == 201, response.text
    return response.json()
