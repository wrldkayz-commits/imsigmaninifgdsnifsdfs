"""GUIForge backend entry point.

Run with:  uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from api import router
from generators.base import registry
from models.catalog import WIDGET_SPECS
from plugins import load_plugins


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Load plugins before serving the first request."""
    load_plugins()
    implemented = sum(1 for info in registry.list_info() if registry.has(info.id))
    print(f"[GUIForge] {len(WIDGET_SPECS)} widget types, "
          f"{len(registry.list_info())} generators registered "
          f"({implemented} implemented).")
    yield


app = FastAPI(
    lifespan=lifespan,
    title="GUIForge API",
    version="1.0.0",
    description=(
        "Framework-agnostic backend for the GUIForge visual GUI designer. "
        "Serves the widget catalog, runs code generators, and packages exports."
    ),
)

# In development the frontend runs on Vite's own server and needs CORS. In
# production it is served from this same origin (see below), so CORS is
# irrelevant there — but allowing extra origins by default would be a needless
# widening, hence the env var.
_allowed_origins = [
    origin.strip()
    for origin in os.getenv(
        "GUIFORGE_ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    # Browsers hide every response header from cross-origin JavaScript unless it
    # is named here. Without this the export download would arrive with no
    # filename when the frontend is hosted on a different origin.
    expose_headers=["Content-Disposition"],
)

app.include_router(router)


# ---------------------------------------------------------------------------
# Static frontend
# ---------------------------------------------------------------------------
#
# When `frontend/dist` exists (i.e. after `npm run build`), the API also serves
# the built single-page app from the same origin. That collapses the whole
# product into one deployable process: no CORS, no reverse-proxy rules, one
# health check. During development the directory is absent and these routes
# simply do not mount, leaving Vite in charge.

_FRONTEND_DIST = Path(
    os.getenv("GUIFORGE_FRONTEND_DIST", Path(__file__).parent.parent / "frontend" / "dist")
)


def _mount_frontend(application: FastAPI, dist: Path) -> None:
    index = dist / "index.html"
    if not index.is_file():
        return

    # Hashed build assets are safe to cache aggressively; `index.html` is not,
    # which is why it is served by an explicit route rather than by StaticFiles.
    assets = dist / "assets"
    if assets.is_dir():
        application.mount("/assets", StaticFiles(directory=assets), name="assets")

    @application.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str) -> FileResponse:
        """Serve real files when they exist, otherwise the SPA entry point.

        The catch-all must not swallow API routes — it is registered after the
        router, so FastAPI matches `/api/*` first — and it must not let a
        crafted path escape the dist directory, hence the resolved-prefix check.
        """
        candidate = (dist / full_path).resolve()
        if full_path and candidate.is_file() and candidate.is_relative_to(dist.resolve()):
            return FileResponse(candidate)
        return FileResponse(index)

    print(f"[GUIForge] Serving the built frontend from {dist}")


@app.get("/api", include_in_schema=False)
def api_root() -> dict:
    return {"name": "GUIForge API", "docs": "/docs", "health": "/api/health"}


_mount_frontend(app, _FRONTEND_DIST)


if not (_FRONTEND_DIST / "index.html").is_file():

    @app.get("/", include_in_schema=False)
    def root() -> dict:
        """Development fallback when no frontend build is present."""
        return {
            "name": "GUIForge API",
            "docs": "/docs",
            "api": "/api/health",
            "note": "No frontend build found. Run `npm run build` in ./frontend, "
                    "or use the Vite dev server on port 5173.",
        }
