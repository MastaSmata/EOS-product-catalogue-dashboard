from __future__ import annotations

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.responses import JSONResponse

from .config import PROJECT_ROOT, Settings
from .media import MediaManager
from .product_service import ProductService
from .repositories.users import migrate_legacy_users
from .routers import auth, products, variations
from .storage import CsvStore

load_dotenv(PROJECT_ROOT / ".env", override=False)


def create_app(settings: Settings | None = None) -> FastAPI:
    config = settings or Settings.from_env()
    config.data_dir.mkdir(parents=True, exist_ok=True)
    config.media_dir.mkdir(parents=True, exist_ok=True)
    store = CsvStore(config.data_dir)
    migrate_legacy_users(store)
    media = MediaManager(config)
    product_service = ProductService(store, config, media)

    application = FastAPI(
        title="EOS PCM Local API",
        description="Local-testing API for authenticated EOS product catalogue records, media, and exports. CSV and filesystem persistence are development-scale only.",
        version="1.0.0",
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
    )
    application.state.settings = config
    application.state.store = store
    application.state.media = media
    application.state.products = product_service

    application.include_router(auth.router, prefix="/api/v1")
    application.include_router(products.router, prefix="/api/v1")
    application.include_router(variations.router, prefix="/api/v1")

    @application.middleware("http")
    async def no_store_api(request, call_next):
        response = await call_next(request)
        if request.url.path.startswith("/api/"):
            response.headers.setdefault("Cache-Control", "no-store")
            response.headers.setdefault("X-Content-Type-Options", "nosniff")
        return response

    @application.get("/api/v1/health")
    def health():
        return {"ok": True, "storage": "csv", "media": "local-filesystem", "mode": "local-testing"}

    return application


app = create_app()
