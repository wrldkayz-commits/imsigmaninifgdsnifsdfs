"""API contract tests.

These pin the shape the frontend depends on. If a change here breaks, the
frontend breaks — which is exactly what these tests exist to catch.
"""

from __future__ import annotations

import io
import json
import zipfile

import pytest
from fastapi.testclient import TestClient

from main import app
from models.schema import SCHEMA_VERSION


@pytest.fixture(scope="module")
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client


def test_health(client: TestClient) -> None:
    payload = client.get("/api/health").json()
    assert payload["status"] == "ok"
    assert payload["schemaVersion"] == SCHEMA_VERSION
    assert payload["widgetTypes"] > 30


def test_catalog_is_camel_case_and_complete(client: TestClient) -> None:
    payload = client.get("/api/catalog").json()
    widgets = payload["widgets"]

    assert len(widgets) > 30
    types = {w["type"] for w in widgets}
    assert {"window", "button", "label", "tabs", "table", "slider"} <= types

    button = next(w for w in widgets if w["type"] == "button")
    assert "defaultSize" in button, "the API must serialise camelCase for TypeScript"
    assert button["category"] == "Buttons"


def test_generators_expose_planned_frameworks(client: TestClient) -> None:
    entries = client.get("/api/generators").json()["generators"]
    by_id = {e["id"]: e for e in entries}

    assert by_id["tkinter"]["available"] is True
    assert by_id["wpf"]["available"] is False
    assert by_id["wpf"]["status"] == "planned"
    # The frontend renders this list verbatim; every entry needs display data.
    assert all(e["label"] and e["languageLabel"] and e["monacoLanguage"] for e in entries)


def test_templates_round_trip(client: TestClient) -> None:
    templates = client.get("/api/templates").json()
    assert len(templates) >= 13

    project = client.get(f"/api/templates/{templates[0]['id']}").json()
    assert project["schemaVersion"] == SCHEMA_VERSION
    assert project["widgets"]

    response = client.post("/api/generate", json={"project": project,
                                                  "generator": "tkinter"})
    assert response.status_code == 200
    body = response.json()
    assert body["files"][0]["content"].startswith('"""')
    assert body["durationMs"] >= 0


def test_unknown_template_is_404(client: TestClient) -> None:
    assert client.get("/api/templates/does-not-exist").status_code == 404


def test_unknown_generator_is_404(client: TestClient) -> None:
    project = client.get("/api/templates/login").json()
    response = client.post("/api/generate", json={"project": project,
                                                  "generator": "cobol_forms"})
    assert response.status_code == 404


def test_validate_reports_issues_and_statistics(client: TestClient) -> None:
    project = client.get("/api/templates/dashboard").json()
    payload = client.post("/api/validate", json={"project": project}).json()

    assert payload["statistics"]["widgetCount"] > 10
    assert payload["statistics"]["byCategory"]
    assert isinstance(payload["issues"], list)
    assert isinstance(payload["accessibility"], list)


def test_validate_flags_a_broken_project(client: TestClient) -> None:
    project = {
        "schemaVersion": SCHEMA_VERSION,
        "widgets": [
            {"id": "dup", "type": "button", "name": "A"},
            {"id": "dup", "type": "button", "name": "B"},
            {"id": "ghost", "type": "not_a_real_widget"},
        ],
    }
    issues = client.post("/api/validate", json={"project": project}).json()["issues"]
    codes = {i["code"] for i in issues}

    assert "duplicate-id" in codes
    assert "unknown-type" in codes
    assert "no-window" in codes


def test_export_zip_contains_sources_and_project(client: TestClient) -> None:
    project = client.get("/api/templates/settings").json()
    response = client.post("/api/export", json={"project": project,
                                                "generator": "pyqt6",
                                                "format": "zip"})
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"

    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        names = archive.namelist()
        assert "src/main.py" in names
        assert "project.guiforge.json" in names
        assert "theme.json" in names
        assert "README.md" in names
        # The bundled project must reopen cleanly.
        document = json.loads(archive.read("project.guiforge.json"))
        assert client.post("/api/projects/load",
                           json={"document": document}).status_code == 200


def test_export_source_returns_a_single_file(client: TestClient) -> None:
    project = client.get("/api/templates/calculator").json()
    response = client.post("/api/export", json={"project": project,
                                                "generator": "tkinter",
                                                "format": "source"})
    assert response.status_code == 200
    assert "attachment" in response.headers["content-disposition"]
    compile(response.text, "main.py", "exec")


def test_load_rejects_a_future_schema(client: TestClient) -> None:
    response = client.post("/api/projects/load",
                           json={"document": {"schemaVersion": SCHEMA_VERSION + 99}})
    assert response.status_code == 400
    assert "newer version" in response.json()["detail"]


def test_load_accepts_a_minimal_document(client: TestClient) -> None:
    """Hand-written project files should work, with defaults filling the gaps."""
    document = {
        "schemaVersion": SCHEMA_VERSION,
        "project": {"name": "Minimal"},
        "window": {"title": "Demo", "width": 400, "height": 300},
        "widgets": [{"id": "b1", "type": "button", "text": "Click Me"}],
    }
    payload = client.post("/api/projects/load", json={"document": document}).json()

    assert payload["project"]["name"] == "Minimal"
    assert payload["widgets"][0]["layout"]["size"]["width"] == 100
