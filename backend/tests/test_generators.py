"""Generator contract tests.

The important guarantee is uniform: *every* registered generator must handle
*every* template and *every* widget type in the catalog without raising, and
Python generators must emit code that actually compiles. Parametrising over the
registry means a newly added generator is covered the moment it is registered —
nobody has to remember to add tests for it.
"""

from __future__ import annotations

import pytest

from generators.base import registry
from models.catalog import WIDGET_SPECS, get_spec
from models.schema import Layout, Point, Project, ProjectMeta, Size, Widget, WindowSpec
from services import templates as template_service

GENERATOR_IDS = [info.id for info in registry.list_info() if registry.has(info.id)]
TEMPLATE_IDS = [t.id for t in template_service.list_templates()]
PYTHON_GENERATORS = [gid for gid in GENERATOR_IDS
                     if registry.get(gid).info.language == "python"]


def _project_with(widget_type: str) -> Project:
    spec = get_spec(widget_type)
    assert spec is not None
    width, height = spec.default_size
    child = Widget(
        id=f"{widget_type}_1",
        type=widget_type,
        name=f"Test{widget_type}",
        text=spec.default_text or "Sample",
        layout=Layout(position=Point(x=20, y=20), size=Size(width=width, height=height)),
        props=spec.default_props(),
        events={event.value: f"on_{event.value}" for event in spec.events},
    )
    return Project(
        project=ProjectMeta(name="Widget Probe"),
        window=WindowSpec(title="Probe", width=640, height=480),
        widgets=[Widget(id="window_root", type="window", text="Probe", children=[child])],
    )


def test_registry_is_populated() -> None:
    assert GENERATOR_IDS, "no generators were discovered"
    assert {"tkinter", "customtkinter", "pyqt6", "dearpygui"} <= set(GENERATOR_IDS)


@pytest.mark.parametrize("generator_id", GENERATOR_IDS)
@pytest.mark.parametrize("template_id", TEMPLATE_IDS)
def test_every_generator_handles_every_template(generator_id: str, template_id: str) -> None:
    result = registry.get(generator_id).run(template_service.get_template(template_id))

    assert result.files, f"{generator_id} produced no files for {template_id}"
    assert result.entry is not None
    assert result.entry.path != "error.txt", result.entry.content
    assert not [d for d in result.diagnostics if d.level == "error"]


@pytest.mark.parametrize("generator_id", PYTHON_GENERATORS)
@pytest.mark.parametrize("template_id", TEMPLATE_IDS)
def test_python_output_compiles(generator_id: str, template_id: str) -> None:
    result = registry.get(generator_id).run(template_service.get_template(template_id))
    entry = result.entry
    assert entry is not None
    compile(entry.content, entry.path, "exec")  # raises SyntaxError on bad output


@pytest.mark.parametrize("generator_id", GENERATOR_IDS)
@pytest.mark.parametrize("widget_type", [spec.type for spec in WIDGET_SPECS
                                         if not spec.root_only])
def test_every_widget_type_is_handled(generator_id: str, widget_type: str) -> None:
    """A generator may not support a widget, but it must never crash on one."""
    result = registry.get(generator_id).run(_project_with(widget_type))

    assert result.files
    assert result.entry.path != "error.txt", result.entry.content
    if registry.get(generator_id).info.language == "python":
        compile(result.entry.content, result.entry.path, "exec")


@pytest.mark.parametrize("generator_id", GENERATOR_IDS)
def test_empty_project_is_valid(generator_id: str) -> None:
    result = registry.get(generator_id).run(Project())
    assert result.entry is not None
    if registry.get(generator_id).info.language == "python":
        compile(result.entry.content, result.entry.path, "exec")


@pytest.mark.parametrize("generator_id", GENERATOR_IDS)
def test_output_is_deterministic(generator_id: str) -> None:
    """The live code panel regenerates constantly; identical input must give
    identical output or the editor would flicker and diffs would be noise."""
    project = template_service.get_template("dashboard")
    first = registry.get(generator_id).run(project)
    second = registry.get(generator_id).run(project)

    assert [f.content for f in first.files] == [f.content for f in second.files]


@pytest.mark.parametrize("generator_id", GENERATOR_IDS)
def test_duplicate_names_do_not_collide(generator_id: str) -> None:
    project = Project(
        widgets=[Widget(id="root", type="window", children=[
            Widget(id=f"b{i}", type="button", name="Submit", text="Submit",
                   layout=Layout(position=Point(x=10, y=10 + i * 40)))
            for i in range(3)
        ])]
    )
    result = registry.get(generator_id).run(project)
    assert result.entry.path != "error.txt"
    if registry.get(generator_id).info.language == "python":
        compile(result.entry.content, result.entry.path, "exec")
