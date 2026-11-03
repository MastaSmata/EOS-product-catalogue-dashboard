from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import os
import re
import shutil
import subprocess
import tempfile
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import quote

from fastapi import UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError

try:
    import pillow_avif  # noqa: F401  # registers AVIF support with Pillow when installed
except ImportError:
    # Newer Pillow builds may provide native AVIF support without the plugin.
    if "AVIF" not in set(Image.registered_extensions().values()):
        raise RuntimeError("AVIF image support is unavailable. Install the pinned pillow-avif-plugin dependency.")

from .config import Settings

_SKU_SAFE = re.compile(r"[^a-z0-9-]+")
_ALLOWED_IMAGE_FORMATS = {"JPEG", "PNG", "WEBP", "GIF", "AVIF", "TIFF"}
_MAX_CHUNK = 1024 * 1024


@dataclass
class MediaBatch:
    manager: "MediaManager"
    records: list[dict]
    staged: list[tuple[Path, Path]] = field(default_factory=list)
    committed: list[Path] = field(default_factory=list)
    staging_dir: Path | None = None

    def commit(self) -> None:
        try:
            for temporary, destination in self.staged:
                destination.parent.mkdir(parents=True, exist_ok=True)
                os.replace(temporary, destination)
                self.committed.append(destination)
            if self.staging_dir:
                shutil.rmtree(self.staging_dir, ignore_errors=True)
                self.staging_dir = None
        except Exception:
            self.rollback()
            raise

    def rollback(self) -> None:
        for path in self.committed:
            try:
                path.unlink(missing_ok=True)
            except OSError:
                pass
        self.committed.clear()
        for temporary, _ in self.staged:
            try:
                temporary.unlink(missing_ok=True)
            except OSError:
                pass
        if self.staging_dir:
            shutil.rmtree(self.staging_dir, ignore_errors=True)
            self.staging_dir = None

    def cleanup_removed(self, removed: list[dict]) -> None:
        for item in removed:
            try:
                self.manager.path_for(item["path"]).unlink(missing_ok=True)
            except (OSError, ValueError):
                continue


class MediaError(ValueError):
    pass


class MediaTooLarge(MediaError):
    pass


class MediaManager:
    def __init__(self, settings: Settings):
        self.root = settings.media_dir.resolve()
        self.settings = settings
        self.secret = settings.jwt_secret.encode("utf-8")
        self.root.mkdir(parents=True, exist_ok=True)

    def _signed_signature(self, user_id: str, product_id: str, media_id: str, expires: int) -> str:
        payload = f"{user_id}:{product_id}:{media_id}:{expires}".encode("utf-8")
        return hmac.new(self.secret, payload, hashlib.sha256).hexdigest()

    def public_media(self, item: dict, user_id: str, product_id: str) -> dict:
        import time

        expires = int(time.time()) + 1800
        signature = self._signed_signature(user_id, product_id, item["id"], expires)
        return {
            **item,
            "url": f"/api/v1/products/{quote(product_id)}/media/{quote(item['id'])}?u={quote(user_id)}&exp={expires}&sig={signature}",
        }

    def verify_signed_url(self, user_id: str, product_id: str, media_id: str, expires: int, signature: str) -> bool:
        import time

        if expires <= int(time.time()) or expires > int(time.time()) + 3600:
            return False
        expected = self._signed_signature(user_id, product_id, media_id, expires)
        return hmac.compare_digest(expected, signature)

    def path_for(self, relative_path: str) -> Path:
        candidate = (self.root / relative_path).resolve()
        if self.root not in candidate.parents:
            raise ValueError("Media path is outside the private upload directory.")
        return candidate

    async def _stage_upload(self, upload: UploadFile, staging_dir: Path) -> tuple[Path, int]:
        media_type = (upload.content_type or "").lower()
        if media_type.startswith("image/"):
            limit = self.settings.max_image_bytes
        elif media_type.startswith("video/"):
            limit = self.settings.max_video_bytes
        else:
            raise MediaError("Only image and video files are accepted.")
        suffix = Path(upload.filename or "upload").suffix[:12]
        source = staging_dir / f"source-{uuid.uuid4().hex}{suffix}"
        total = 0
        try:
            with source.open("xb") as out:
                while True:
                    chunk = await upload.read(_MAX_CHUNK)
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > limit:
                        raise MediaTooLarge(f"File exceeds the configured {limit // (1024 * 1024)} MB upload limit.")
                    out.write(chunk)
                out.flush()
                os.fsync(out.fileno())
        except Exception:
            source.unlink(missing_ok=True)
            raise
        finally:
            await upload.close()
        if total == 0:
            source.unlink(missing_ok=True)
            raise MediaError("Empty files cannot be uploaded.")
        return source, total

    def _convert_image(self, source: Path, output: Path) -> tuple[str, str]:
        try:
            with Image.open(source) as image:
                image.verify()
            with Image.open(source) as image:
                if (image.format or "").upper() not in _ALLOWED_IMAGE_FORMATS:
                    raise MediaError("The uploaded image format is not supported.")
                converted = ImageOps.exif_transpose(image)
                if converted is None:
                    raise MediaError("The uploaded image could not be oriented safely.")
                if converted.mode not in {"RGB", "RGBA"}:
                    converted = converted.convert("RGBA" if "transparency" in converted.info else "RGB")
                converted.save(output, format="AVIF", quality=55, speed=6)
        except (UnidentifiedImageError, OSError, ValueError) as exc:
            if isinstance(exc, MediaError):
                raise
            raise MediaError("The image could not be decoded safely.") from exc
        return "image", "image/avif"

    def _probe_video(self, source: Path) -> float:
        try:
            result = subprocess.run(
                [self.settings.ffprobe_path, "-v", "error", "-show_entries", "format=duration,format_name", "-show_entries", "stream=codec_type", "-of", "json", str(source)],
                capture_output=True, text=True, check=True, timeout=15,
            )
            info = json.loads(result.stdout)
            formats = set(str(info.get("format", {}).get("format_name", "")).split(","))
            has_video = any(stream.get("codec_type") == "video" for stream in info.get("streams", []))
            duration = float(info.get("format", {}).get("duration", 0))
            if not has_video or not formats.intersection({"mov", "mp4", "m4a", "3gp", "3g2", "mj2", "matroska", "webm", "mpeg", "avi"}):
                raise MediaError("The uploaded file is not a supported video container.")
            if duration <= 0 or duration > self.settings.max_video_seconds:
                raise MediaError(f"Video duration must be between 1 and {self.settings.max_video_seconds} seconds.")
            return duration
        except (subprocess.SubprocessError, json.JSONDecodeError, OSError, ValueError) as exc:
            if isinstance(exc, MediaError):
                raise
            raise MediaError("The video could not be inspected safely.") from exc

    def _convert_video(self, source: Path, output: Path) -> tuple[str, str]:
        duration = self._probe_video(source)
        try:
            subprocess.run(
                [self.settings.ffmpeg_path, "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", str(source),
                 "-map", "0:v:0", "-map", "0:a?", "-vf", "scale='min(1920,iw)':-2", "-c:v", "libvpx-vp9",
                 "-crf", "36", "-b:v", "0", "-deadline", "realtime", "-cpu-used", "5",
                 "-c:a", "libopus", "-b:a", "96k", "-t", str(self.settings.max_video_seconds), str(output)],
                capture_output=True, text=True, check=True,
                timeout=min(self.settings.max_video_seconds * 2 + 30, max(60, int(duration * 4 + 30))),
            )
        except (subprocess.SubprocessError, OSError) as exc:
            output.unlink(missing_ok=True)
            raise MediaError("FFmpeg could not convert this video to WebM.") from exc
        if not output.exists() or output.stat().st_size == 0:
            raise MediaError("FFmpeg produced an empty WebM file.")
        return "video", "video/webm"

    async def prepare_uploads(self, user_id: str, product_id: str, sku: str, uploads: list[UploadFile], existing: list[dict]) -> MediaBatch:
        if not uploads:
            return MediaBatch(self, list(existing))
        if len(existing) + len(uploads) > self.settings.max_media_per_product:
            raise MediaError(f"A product can have no more than {self.settings.max_media_per_product} media files.")
        safe_sku = _SKU_SAFE.sub("-", sku.lower()).strip("-")
        user_root = self.path_for(f"users/{user_id}")
        staging_root = self.path_for(f".staging/{uuid.uuid4().hex}")
        staging_root.mkdir(parents=True, exist_ok=False)
        staged: list[tuple[Path, Path]] = []
        records: list[dict] = list(existing)
        try:
            for offset, upload in enumerate(uploads, start=len(existing) + 1):
                source, input_size = await self._stage_upload(upload, staging_root)
                supplied_type = (upload.content_type or "").lower()
                media_type = "image" if supplied_type.startswith("image/") else "video"
                media_id = uuid.uuid4().hex
                subdir = "images" if media_type == "image" else "videos"
                suffix = ".avif" if media_type == "image" else ".webm"
                filename = f"{safe_sku}_{offset}_{media_id[:8]}{suffix}"
                relative = f"users/{user_id}/{subdir}/{filename}"
                destination = self.path_for(relative)
                temporary = staging_root / f"converted-{media_id}{suffix}"
                if media_type == "image":
                    final_type, mime = await asyncio.to_thread(self._convert_image, source, temporary)
                else:
                    final_type, mime = await asyncio.to_thread(self._convert_video, source, temporary)
                records.append({
                    "id": media_id, "name": Path(upload.filename or "media").name[:180], "filename": filename,
                    "media_type": final_type, "content_type": mime, "path": relative,
                    "input_size": input_size, "size": temporary.stat().st_size,
                })
                staged.append((temporary, destination))
            return MediaBatch(self, records, staged, staging_dir=staging_root)
        except Exception:
            for temporary, _ in staged:
                temporary.unlink(missing_ok=True)
            shutil.rmtree(staging_root, ignore_errors=True)
            raise
