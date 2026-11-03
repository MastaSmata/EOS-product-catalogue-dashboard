from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CURRENCIES = (
    "NGN", "USD", "EUR", "GBP", "CAD", "AUD", "NZD", "CHF", "SGD", "JPY", "CNY", "INR",
    "AED", "SAR", "GHS", "KES", "ZAR", "EGP", "UGX", "TZS", "RWF", "ETB", "XOF", "XAF",
)


def _path_from_env(name: str, default: str) -> Path:
    raw = Path(os.getenv(name, default)).expanduser()
    return (PROJECT_ROOT / raw).resolve() if not raw.is_absolute() else raw.resolve()


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    media_dir: Path
    jwt_secret: str
    token_ttl_minutes: int = 60
    max_image_bytes: int = 15 * 1024 * 1024
    max_video_bytes: int = 100 * 1024 * 1024
    max_video_seconds: int = 120
    max_media_per_product: int = 3
    allowed_currencies: tuple[str, ...] = DEFAULT_CURRENCIES
    ffmpeg_path: str = "ffmpeg"
    ffprobe_path: str = "ffprobe"

    def __post_init__(self) -> None:
        if len(self.jwt_secret) < 32:
            raise ValueError("PCM_JWT_SECRET must be at least 32 characters. Generate a local secret; do not use the example value.")
        if self.token_ttl_minutes < 5 or self.token_ttl_minutes > 24 * 60:
            raise ValueError("Token lifetime must be between 5 minutes and 24 hours.")
        if self.max_image_bytes < 1024 or self.max_video_bytes < 1024 or self.max_video_seconds < 1:
            raise ValueError("Media limits must be positive and non-trivial.")
        if self.max_media_per_product < 1 or self.max_media_per_product > 3:
            raise ValueError("PCM_MAX_MEDIA_PER_PRODUCT must be between 1 and the supported maximum of 3.")
        if not self.allowed_currencies or any(len(code) != 3 or not code.isalpha() or code != code.upper() for code in self.allowed_currencies):
            raise ValueError("Configured currencies must be uppercase three-letter ISO-style codes.")

    @classmethod
    def from_env(cls) -> "Settings":
        currencies = tuple(dict.fromkeys(
            code.strip().upper() for code in os.getenv("PCM_ALLOWED_CURRENCIES", ",".join(DEFAULT_CURRENCIES)).split(",") if code.strip()
        ))
        return cls(
            data_dir=_path_from_env("PCM_DATA_DIR", "backend/data"),
            media_dir=_path_from_env("PCM_MEDIA_DIR", "backend/uploads"),
            jwt_secret=os.getenv("PCM_JWT_SECRET", ""),
            token_ttl_minutes=int(os.getenv("PCM_TOKEN_TTL_MINUTES", "60")),
            max_image_bytes=int(os.getenv("PCM_MAX_IMAGE_BYTES", str(15 * 1024 * 1024))),
            max_video_bytes=int(os.getenv("PCM_MAX_VIDEO_BYTES", str(100 * 1024 * 1024))),
            max_video_seconds=int(os.getenv("PCM_MAX_VIDEO_SECONDS", "120")),
            max_media_per_product=int(os.getenv("PCM_MAX_MEDIA_PER_PRODUCT", "3")),
            allowed_currencies=currencies,
            ffmpeg_path=os.getenv("PCM_FFMPEG_PATH", "ffmpeg"),
            ffprobe_path=os.getenv("PCM_FFPROBE_PATH", "ffprobe"),
        )
