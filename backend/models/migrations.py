"""Forward migrations for the project document format.

Every persisted project carries a `schemaVersion`. On load, `migrate()` applies
each registered step in order until the document reaches `SCHEMA_VERSION`, so a
file written by any past release still opens.

Adding a migration
------------------
Bump `SCHEMA_VERSION` in `schema.py`, then register the step:

    @migration(from_version=1)
    def _v1_to_v2(doc: dict) -> dict:
        for widget in _walk(doc.get("widgets", [])):
            widget.setdefault("newField", default)
        return doc

Migrations operate on raw dicts, never on Pydantic models — the models describe
only the *current* version, and parsing an old document with them would fail
before the migration could run.
"""

from __future__ import annotations

from typing import Callable

from .schema import SCHEMA_VERSION

Migration = Callable[[dict], dict]
_MIGRATIONS: dict[int, Migration] = {}


def migration(from_version: int) -> Callable[[Migration], Migration]:
    def decorator(func: Migration) -> Migration:
        if from_version in _MIGRATIONS:
            raise ValueError(f"A migration from version {from_version} already exists")
        _MIGRATIONS[from_version] = func
        return func

    return decorator


def _walk(widgets: list[dict]):
    """Depth-first iteration over raw widget dicts."""
    for widget in widgets:
        yield widget
        yield from _walk(widget.get("children", []))


def migrate(document: dict) -> dict:
    """Bring `document` up to the current schema version."""
    version = int(document.get("schemaVersion", document.get("schema_version", 1)))
    if version > SCHEMA_VERSION:
        raise ValueError(
            f"This project was created with a newer version of GUIForge "
            f"(schema v{version}; this build understands v{SCHEMA_VERSION})."
        )
    while version < SCHEMA_VERSION:
        step = _MIGRATIONS.get(version)
        if step is None:
            raise ValueError(f"No migration registered from schema v{version}")
        document = step(document)
        version += 1
        document["schemaVersion"] = version
    return document
