from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.v1 import api_router
from app.api.v1.routes.health import health
from app.core.errors import configure_exception_handlers
from app.core.settings import get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        docs_url="/docs" if settings.app_env == "local" else None,
        redoc_url="/redoc" if settings.app_env == "local" else None,
    )

    configure_exception_handlers(app)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )
    app.include_router(api_router, prefix="/api/v1")
    app.add_api_route("/health", health, methods=["GET"], tags=["health"])
    if settings.app_env == "local" or settings.object_storage_provider == "local":
        upload_root = Path("data/uploads")
        upload_root.mkdir(parents=True, exist_ok=True)
        app.mount("/uploads", StaticFiles(directory=upload_root), name="uploads")

    @app.get("/", tags=["system"])
    def root() -> dict[str, str]:
        return {
            "name": settings.app_name,
            "status": "ok",
            "version": settings.app_version,
        }

    return app


app = create_app()
