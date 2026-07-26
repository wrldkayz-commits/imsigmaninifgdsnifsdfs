"""Request/response models for the REST API.

Kept separate from the domain models so the wire format can evolve without
dragging the persisted project schema with it.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from models.schema import Project


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class GenerateRequest(ApiModel):
    project: Project
    generator: str = "tkinter"


class GeneratedFileOut(ApiModel):
    path: str
    content: str
    language: str
    line_count: int


class DiagnosticOut(ApiModel):
    level: str
    message: str
    widget_id: str | None = None


class GenerateResponse(ApiModel):
    generator: str
    files: list[GeneratedFileOut]
    diagnostics: list[DiagnosticOut]
    duration_ms: float


class ValidateRequest(ApiModel):
    project: Project


class ValidateResponse(ApiModel):
    issues: list[dict]
    accessibility: list[dict]
    statistics: dict


class ExportRequest(ApiModel):
    project: Project
    generator: str = "tkinter"
    format: str = Field(default="zip", description="zip | source | json | theme")
    include_project: bool = True
    include_theme: bool = True
    include_assets: bool = True


class LoadProjectRequest(ApiModel):
    """A raw document straight from a file, before migration."""

    document: dict


class TemplateOut(ApiModel):
    id: str
    name: str
    description: str
    category: str
