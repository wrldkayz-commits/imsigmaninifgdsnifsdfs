"""REST endpoints.

The contract with the frontend is deliberately narrow and entirely data-driven:

  GET  /api/catalog     - every widget type, its properties and its events
  GET  /api/generators  - every framework, implemented or planned
  GET  /api/templates   - starter projects
  POST /api/generate    - project -> source files (live code panel)
  POST /api/validate    - project -> errors, accessibility issues, statistics
  POST /api/export      - project -> downloadable artifact
  POST /api/projects/load - migrate a raw document to the current schema

The frontend never learns what a "Tkinter" is; it renders whatever these
endpoints describe.
"""

from __future__ import annotations

import time

from fastapi import APIRouter, HTTPException, Response

from generators.base import registry
from models.catalog import WIDGET_SPECS
from models.migrations import migrate
from models.schema import SCHEMA_VERSION, Project
from services import export as export_service
from services import templates as template_service
from services import validation

from .schemas import (
    DiagnosticOut,
    ExportRequest,
    GeneratedFileOut,
    GenerateRequest,
    GenerateResponse,
    LoadProjectRequest,
    TemplateOut,
    ValidateRequest,
    ValidateResponse,
)

router = APIRouter(prefix="/api")


@router.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "schemaVersion": SCHEMA_VERSION,
        "widgetTypes": len(WIDGET_SPECS),
        "generators": len(registry.list_info()),
    }


@router.get("/catalog")
def catalog() -> dict:
    """The widget catalog that drives the library, canvas and inspector."""
    return {
        "schemaVersion": SCHEMA_VERSION,
        "widgets": [spec.model_dump(by_alias=True) for spec in WIDGET_SPECS],
    }


@router.get("/generators")
def generators() -> dict:
    return {
        "generators": [
            {
                "id": info.id,
                "label": info.label,
                "language": info.language,
                "languageLabel": info.language_label,
                "extension": info.extension,
                "description": info.description,
                "status": info.status,
                "monacoLanguage": info.monaco_language,
                "features": list(info.features),
                "available": registry.has(info.id),
            }
            for info in registry.list_info()
        ]
    }


@router.get("/templates", response_model=list[TemplateOut])
def templates() -> list[TemplateOut]:
    return [TemplateOut(id=t.id, name=t.name, description=t.description,
                        category=t.category)
            for t in template_service.list_templates()]


@router.get("/templates/{template_id}")
def template(template_id: str) -> dict:
    try:
        project = template_service.get_template(template_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Unknown template '{template_id}'")
    return project.model_dump(by_alias=True)


@router.post("/generate", response_model=GenerateResponse)
def generate(request: GenerateRequest) -> GenerateResponse:
    if not registry.has(request.generator):
        raise HTTPException(
            status_code=404,
            detail=f"Generator '{request.generator}' is not available in this build.")

    started = time.perf_counter()
    result = registry.get(request.generator).run(request.project)
    elapsed = (time.perf_counter() - started) * 1000

    return GenerateResponse(
        generator=request.generator,
        files=[GeneratedFileOut(path=f.path, content=f.content, language=f.language,
                                line_count=f.line_count)
               for f in result.files],
        diagnostics=[DiagnosticOut(level=d.level, message=d.message, widget_id=d.widget_id)
                     for d in result.diagnostics],
        duration_ms=round(elapsed, 2),
    )


@router.post("/validate", response_model=ValidateResponse)
def validate(request: ValidateRequest) -> ValidateResponse:
    project = request.project
    return ValidateResponse(
        issues=[i.as_dict() for i in validation.validate(project)],
        accessibility=[i.as_dict() for i in validation.check_accessibility(project)],
        statistics=validation.statistics(project).as_dict(),
    )


@router.post("/projects/load")
def load_project(request: LoadProjectRequest) -> dict:
    """Migrate a document from disk and return it at the current schema version."""
    try:
        migrated = migrate(dict(request.document))
        project = Project.model_validate(migrated)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return project.model_dump(by_alias=True)


@router.post("/export")
def export(request: ExportRequest) -> Response:
    project = request.project

    if request.format == "json":
        return Response(
            content=export_service.bundle_json(project),
            media_type="application/json",
            headers=_attachment(f"{_slug(project)}.guiforge.json"),
        )

    if request.format == "theme":
        return Response(
            content=export_service.theme_json(project),
            media_type="application/json",
            headers=_attachment(f"{_slug(project)}-theme.json"),
        )

    if not registry.has(request.generator):
        raise HTTPException(status_code=404,
                            detail=f"Generator '{request.generator}' is not available.")

    generator = registry.get(request.generator)
    result = generator.run(project)

    if request.format == "source":
        entry = result.entry
        if entry is None:
            raise HTTPException(status_code=500, detail="The generator produced no files.")
        return Response(
            content=entry.content,
            media_type="text/plain; charset=utf-8",
            headers=_attachment(entry.path),
        )

    if request.format != "zip":
        raise HTTPException(status_code=400, detail=f"Unknown format '{request.format}'.")

    payload = export_service.build_zip(
        project, result, generator.info,
        include_project=request.include_project,
        include_theme=request.include_theme,
        include_assets=request.include_assets,
    )
    return Response(
        content=payload,
        media_type="application/zip",
        headers=_attachment(f"{_slug(project)}-{request.generator}.zip"),
    )


def _attachment(filename: str) -> dict[str, str]:
    return {"Content-Disposition": f'attachment; filename="{filename}"'}


def _slug(project: Project) -> str:
    from generators.shared.naming import snake

    return snake(project.project.name, "project").replace("_", "-")
