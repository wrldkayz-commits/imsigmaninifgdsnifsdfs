"""Code generator plugin contract and registry.

A generator is a self-contained module that turns a `Project` into one or more
source files. Generators are discovered at import time by scanning this package
for subpackages exposing a `CodeGenerator` subclass, so adding support for a new
framework means adding a directory — no core file is edited, and the frontend
never changes because it drives everything off `/api/generators`.
"""

from __future__ import annotations

import importlib
import pkgutil
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path

from models.schema import Project

# ---------------------------------------------------------------------------
# Result types
# ---------------------------------------------------------------------------


@dataclass(slots=True)
class GeneratedFile:
    path: str
    content: str
    language: str = "python"

    @property
    def line_count(self) -> int:
        return self.content.count("\n") + 1


@dataclass(slots=True)
class Diagnostic:
    """A non-fatal message surfaced in the Errors / Console panel."""

    level: str  # "info" | "warning" | "error"
    message: str
    widget_id: str | None = None

    @classmethod
    def warning(cls, message: str, widget_id: str | None = None) -> "Diagnostic":
        return cls("warning", message, widget_id)

    @classmethod
    def error(cls, message: str, widget_id: str | None = None) -> "Diagnostic":
        return cls("error", message, widget_id)


@dataclass(slots=True)
class GenerationResult:
    files: list[GeneratedFile] = field(default_factory=list)
    diagnostics: list[Diagnostic] = field(default_factory=list)

    @property
    def entry(self) -> GeneratedFile | None:
        """The file a user should look at first (and run)."""
        return self.files[0] if self.files else None


# ---------------------------------------------------------------------------
# Generator contract
# ---------------------------------------------------------------------------


@dataclass(slots=True, frozen=True)
class GeneratorInfo:
    """Descriptor the frontend uses to build the export menu. Purely data —
    the UI has no idea what any of these frameworks actually are."""

    id: str
    label: str
    language: str
    language_label: str
    extension: str
    description: str = ""
    status: str = "stable"  # "stable" | "beta" | "planned"
    monaco_language: str = "python"
    features: list[str] = field(default_factory=list)


class CodeGenerator(ABC):
    """Base class for every framework backend.

    Subclasses implement `generate()`. Everything else — registration,
    diagnostics plumbing, packaging into a ZIP — is handled here so each
    generator stays focused on producing idiomatic code for its framework.
    """

    info: GeneratorInfo

    def __init__(self) -> None:
        self._diagnostics: list[Diagnostic] = []

    # -- to implement -------------------------------------------------------

    @abstractmethod
    def generate(self, project: Project) -> list[GeneratedFile]:
        """Produce the source files for `project`. The first file is the entry point."""

    # -- helpers available to subclasses ------------------------------------

    def warn(self, message: str, widget_id: str | None = None) -> None:
        self._diagnostics.append(Diagnostic.warning(message, widget_id))

    def error(self, message: str, widget_id: str | None = None) -> None:
        self._diagnostics.append(Diagnostic.error(message, widget_id))

    def unsupported(self, widget_type: str, widget_id: str) -> None:
        self.warn(
            f"'{widget_type}' has no native equivalent in {self.info.label}; "
            f"a placeholder was emitted instead.",
            widget_id,
        )

    # -- public entry point -------------------------------------------------

    def run(self, project: Project) -> GenerationResult:
        self._diagnostics = []
        try:
            files = self.generate(project)
        except Exception as exc:  # a broken generator must not take down the app
            return GenerationResult(
                files=[GeneratedFile("error.txt", f"# Generation failed: {exc}", "text")],
                diagnostics=[Diagnostic.error(f"{self.info.label}: {exc}")],
            )
        return GenerationResult(files=files, diagnostics=list(self._diagnostics))


# ---------------------------------------------------------------------------
# Registry + discovery
# ---------------------------------------------------------------------------


class GeneratorRegistry:
    def __init__(self) -> None:
        self._generators: dict[str, type[CodeGenerator]] = {}
        self._planned: list[GeneratorInfo] = []

    def register(self, cls: type[CodeGenerator]) -> type[CodeGenerator]:
        self._generators[cls.info.id] = cls
        return cls

    def register_planned(self, info: GeneratorInfo) -> None:
        """Advertise a framework that is on the roadmap but not implemented.

        The export menu shows these greyed out, which is how the UI stays
        unchanged when the real generator lands later.
        """
        self._planned.append(info)

    def get(self, generator_id: str) -> CodeGenerator:
        try:
            return self._generators[generator_id]()
        except KeyError:
            raise KeyError(f"Unknown generator '{generator_id}'") from None

    def has(self, generator_id: str) -> bool:
        return generator_id in self._generators

    def list_info(self) -> list[GeneratorInfo]:
        implemented = [cls.info for cls in self._generators.values()]
        implemented.sort(key=lambda i: (i.language, i.label))
        return implemented + sorted(self._planned, key=lambda i: (i.language, i.label))

    def discover(self, package_path: Path, package_name: str = "generators") -> None:
        """Import every subpackage so `@registry.register` decorators fire."""
        for module in pkgutil.iter_modules([str(package_path)]):
            if not module.ispkg or module.name == "shared":
                continue
            try:
                importlib.import_module(f"{package_name}.{module.name}")
            except Exception as exc:  # a bad plugin should not break startup
                print(f"[GUIForge] Skipped generator '{module.name}': {exc}")


registry = GeneratorRegistry()
