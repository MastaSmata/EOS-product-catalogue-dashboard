from __future__ import annotations

import io
import json
import shutil
import subprocess

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.config import Settings
from app.main import create_app
from conftest import product_payload, register


def make_png() -> bytes:
    image = Image.new("RGB", (32, 24), (21, 125, 90))
    stream = io.BytesIO()
    image.save(stream, format="PNG")
    return stream.getvalue()


def test_image_is_converted_to_private_avif_and_served_from_signed_owner_url(client: TestClient):
    user, headers = register(client)
    response = client.post(
        "/api/v1/products",
        data={"product": json.dumps(product_payload("Media phone"))},
        files=[("files", ("source.png", make_png(), "image/png"))],
        headers=headers,
    )
    assert response.status_code == 201, response.text
    product = response.json()
    media = product["media"][0]
    assert media["media_type"] == "image"
    assert media["content_type"] == "image/avif"
    assert media["filename"].endswith(".avif")
    assert product["sku"].lower() in media["filename"].lower()
    assert media["url"].startswith("/api/v1/products/")

    file_response = client.get(media["url"])
    assert file_response.status_code == 200
    assert file_response.headers["content-type"].startswith("image/avif")
    with Image.open(io.BytesIO(file_response.content)) as converted:
        assert converted.format == "AVIF"

    path_parts = media["path"].split("/")
    assert path_parts[:2] == ["users", user["user"]["id"]]
    assert "/images/" in f"/{media['path']}"


def _small_mp4(tmp_path) -> bytes:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        pytest.skip("FFmpeg is required by the application contract.")
    path = tmp_path / "source.mp4"
    subprocess.run(
        [ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
         "color=c=blue:s=64x64:r=10", "-t", "1", "-an", "-c:v", "mpeg4", "-pix_fmt", "yuv420p", str(path)],
        check=True, capture_output=True, timeout=30,
    )
    return path.read_bytes()


def test_video_is_really_transcoded_to_webm_and_bad_video_rolls_back(app_settings, tmp_path):
    with TestClient(create_app(app_settings)) as client:
        _user, headers = register(client)
        bad = client.post(
            "/api/v1/products",
            data={"product": json.dumps(product_payload("Bad video"))},
            files=[("files", ("bad.mp4", b"not a real video", "video/mp4"))],
            headers=headers,
        )
        assert bad.status_code == 422
        assert client.get("/api/v1/products", headers=headers).json()["total"] == 0
        stage_root = app_settings.media_dir / ".staging"
        assert not stage_root.exists() or not list(stage_root.iterdir())

        response = client.post(
            "/api/v1/products",
            data={"product": json.dumps(product_payload("Video product"))},
            files=[("files", ("source.mp4", _small_mp4(tmp_path), "video/mp4"))],
            headers=headers,
        )
        assert response.status_code == 201, response.text
        media = response.json()["media"][0]
        assert media["media_type"] == "video"
        assert media["content_type"] == "video/webm"
        assert media["filename"].endswith(".webm")
        served = client.get(media["url"])
        assert served.status_code == 200
        assert served.headers["content-type"].startswith("video/webm")
        assert served.content.startswith(b"\x1aE\xdf\xa3")


def test_upload_size_limit_is_enforced_without_partial_product_or_staging(tmp_path, app_settings):
    from dataclasses import replace

    small_limit = replace(app_settings, max_image_bytes=1024)
    with TestClient(create_app(small_limit)) as client:
        _user, headers = register(client)
        large_png = Image.new("RGB", (256, 256), (0, 100, 50))
        encoded = io.BytesIO()
        large_png.save(encoded, format="PNG", compress_level=0)
        response = client.post(
            "/api/v1/products",
            data={"product": json.dumps(product_payload("Oversized image"))},
            files=[("files", ("large.png", encoded.getvalue(), "image/png"))],
            headers=headers,
        )
        assert response.status_code == 413
        assert client.get("/api/v1/products", headers=headers).json()["total"] == 0
        staging = small_limit.media_dir / ".staging"
        assert not staging.exists() or not list(staging.iterdir())
